import * as estree from 'estree'
import * as escope from 'escope'
import * as estraverse from 'estraverse'
import escodegen from 'escodegen'
import { DeminifyOptions } from './deminify'
import { emit, clearAssign } from './lib'
import Case from 'case'

type StringLiteral = { value: string } & estree.Literal

// `AcornNode`, `start`, and `end` are introduced to avoid the pain of
// extensive casting because estree.Node does not specify `start` and `end`
// (estree.Node.range is optional annoyingly, creating a need for null checks)

type AcornNode = {
  start: number
  end: number
} & estree.Node

function start(node: estree.Node) {
  return (node as AcornNode).start
}

function end(node: estree.Node) {
  return (node as AcornNode).end
}

export type DefineFunc = {
  arguments: [
    StringLiteral,
    { elements: StringLiteral[] } & estree.ArrayExpression,
    { params: estree.Identifier[] } & estree.FunctionExpression,
  ]
} & estree.CallExpression

function isDefineFunc(
  node: estree.Node,
  warnOnUnhandled: boolean = false,
): node is DefineFunc {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'define'
  ) {
    const args = node.arguments
    const isDefine =
      args.length === 3 &&
      args[0].type === 'Literal' &&
      typeof args[0].value === 'string' &&
      args[1].type === 'ArrayExpression' &&
      args[1].elements.every(
        (e) =>
          e !== null && e.type === 'Literal' && typeof e.value === 'string',
      ) &&
      args[2].type === 'FunctionExpression' &&
      // must include require
      args[2].params.length >= 1 &&
      args[2].params.every((e) => e.type === 'Identifier')
    if (isDefine) {
      return true
    } else if (warnOnUnhandled) {
      const module = args[0].type === 'Literal' ? args[0].value : ''
      console.warn(
        `Unhandled define() case: define(${
          module ? `'${module}', ` : ''
        }${node.arguments
          .slice(module ? 1 : 0)
          .map((e) => e.type)
          .join(', ')})`,
      )
    }
  }
  return false
}

function isParamOf(
  identifier: estree.Identifier,
  func: estree.FunctionExpression,
) {
  //  handles:
  //    define(..., ..., function(..., e, ...) {
  //      function (e) {
  //           //   ^ this `e` should not be replaced
  //      }
  //    })
  if (func.params.length === 0) {
    return false
  } else {
    return (
      start(func.params[0]) <= start(identifier) &&
      end(identifier) <= end(func.params[func.params.length - 1])
    )
  }
}

function isPropertyNameOf(
  identifier: estree.Identifier,
  property: estree.Property,
) {
  //  handles:
  //    define(..., ..., function(..., e, ...) {
  //      let u = {
  //        e: 'hello'
  //        ^ this `e` should not be replaced
  //      }
  //    })
  return property.computed === false && property.key === identifier
}

function isReassignedIdentifierOf(
  identifier: estree.Identifier,
  declarator: estree.VariableDeclarator,
) {
  //  handles:
  //    define(..., ..., function(..., e, ...) {
  //      let e = 2+2
  //          ^ this `e` should not be replaced
  //    })
  return declarator.id === identifier
}

function isIdentifierComputed(
  identifier: estree.Identifier,
  parent: estree.Node | null,
) {
  if (parent === null) {
    return true
  } else if (parent.type === 'FunctionExpression') {
    return !isParamOf(identifier, parent)
  } else if (parent.type === 'Property') {
    return !isPropertyNameOf(identifier, parent)
  } else if (parent.type === 'VariableDeclarator') {
    return !isReassignedIdentifierOf(identifier, parent)
  } else {
    return true
  }
}

function shouldUpdateScope(node: estree.Node) {
  return /Function/.test(node.type)
}

function definitionNode(variable: string, scope: any): estree.Node | null {
  if (scope.set.has(variable)) {
    return scope.block
  } else if (scope.upper !== null) {
    return definitionNode(variable, scope.upper)
  } else {
    return null
  }
}

function isIdentifierUsedForDefault(
  identifier: estree.Identifier,
  parent: estree.Node | null,
): parent is DefaultRequireMemberExpression {
  return (
    parent !== null &&
    parent.type === 'MemberExpression' &&
    parent.object === identifier &&
    parent.property.type === 'Identifier' &&
    parent.property.name === 'default'
  )
}

type DefaultRequireMemberExpression = estree.MemberExpression & {
  object: estree.Identifier
}

interface DefaultRequire {
  type: 'DefaultRequire'
  memberExpression: DefaultRequireMemberExpression
}

export default class Transformer {
  scopeManager: any
  currentScope: null | any
  defineFuncCount = 0
  // map from variable name → module name (whose require() result is assigned to that variable)
  dependencyMap: Map<string, string> = new Map()
  currentModuleDefineNode: DefineFunc | null = null
  // note that we are limiting to FunctionExpression, not Function
  // (which also includes arrow functions + more)
  currentModuleFunctionNode: estree.FunctionExpression | null = null
  identifiersUsedInCurrentModule: Set<string> = new Set()
  moduleIdentifiers: Array<estree.Identifier | DefaultRequire> = []

  getClosestAvailableNameTo(name: string) {
    const variableName = Case.pascal(name)
    let newName: string = variableName
    if (this.identifiersUsedInCurrentModule.has(variableName)) {
      // only try 9 options before giving up
      let succeeded = false
      for (let i = 1; i <= 9; i++) {
        const tryName = variableName + i
        if (!this.identifiersUsedInCurrentModule.has(tryName)) {
          succeeded = true
          newName = tryName
          break
        }
      }
      if (!succeeded) {
        console.warn(`Duplicate variable, may cause conflicts: ${variableName}`)
      }
    }
    this.identifiersUsedInCurrentModule.add(newName)
    return newName
  }

  getVariableNameForModule(moduleName: string) {
    // Split on `/` to get just get the last part of the path
    // Split on `!` to handle applied loader plugins like 'loadjs!file'
    //   (note: there is no special handling for loader plugins; they just get ignored)
    const parts = moduleName.split(/[!/]/)
    const baseName = parts[parts.length - 1]
    return this.getClosestAvailableNameTo(baseName)
  }

  insertImports() {
    // TODO: create 'import * as Name from ...' and 'import Name from ...'
    //   differently; use the latter only if module.default is used
    //   (in which case, transform a.default to Name);
    //   if some other property is used (such as module.doAThing),
    //   need the former import statement (& transform module.doAThing to Name.doAThing)
    // map from module name → variable referring to module name
    const dependencyNameMap = new Map<string, string>()
    // set of module names used as a non-default import
    const dependenciesUsedAsNonDefault = new Set<string>()
    // same except these would be used as default import (`Name`) instead of Name.doAThing
    const defaultDependencyNameMap = new Map<string, string>()
    // set of module names used as a default import
    const dependenciesUsedAsDefault = new Set<string>()
    // first pass: all non-default requires
    for (const node of this.moduleIdentifiers) {
      if (node.type !== 'DefaultRequire') {
        // node must be an estree.Identifier
        const moduleName = this.dependencyMap.get(node.name)
        if (moduleName === undefined) {
          console.warn(`Unhandled namespace module variable: ${node.name}`)
          continue
        }
        dependenciesUsedAsNonDefault.add(moduleName)
        let name = dependencyNameMap.get(moduleName)
        if (name === undefined) {
          name = this.getVariableNameForModule(moduleName)
          dependencyNameMap.set(moduleName, name)
        }
        node.name = name
      }
    }
    // second pass: all default requires
    // need the first pass before to know if the module is used as a non-default
    // as well as a default import; in this case, need a separate import name
    for (const node of this.moduleIdentifiers) {
      if (node.type === 'DefaultRequire') {
        const moduleName = this.dependencyMap.get(
          node.memberExpression.object.name,
        )
        if (moduleName === undefined) {
          console.warn(
            `'Unhandled default module variable: ${node.memberExpression.object.name}`,
          )
          continue
        }
        dependenciesUsedAsDefault.add(moduleName)
        let name = defaultDependencyNameMap.get(moduleName)
        if (name === undefined) {
          name = this.getVariableNameForModule(
            moduleName +
              (dependenciesUsedAsNonDefault.has(moduleName) ? '-default' : ''),
          )
          defaultDependencyNameMap.set(moduleName, name)
        }
        clearAssign(node, {
          type: 'Identifier',
          name: defaultDependencyNameMap.get(moduleName),
        })
      }
    }
    // add import statements to top of program
    const importsToInsert: estree.ImportDeclaration[] = []
    for (const moduleName of new Set([
      ...dependenciesUsedAsDefault,
      ...dependenciesUsedAsNonDefault,
    ])) {
      console.log('E', this.getCurrentModuleName())
      const specifiers: estree.ImportDeclaration['specifiers'] = []
      if (dependenciesUsedAsNonDefault.has(moduleName)) {
        specifiers.push({
          type: 'ImportNamespaceSpecifier',
          local: {
            type: 'Identifier',
            name: dependencyNameMap.get(moduleName) as string,
          },
        })
      }
      if (dependenciesUsedAsDefault.has(moduleName)) {
        specifiers.push({
          type: 'ImportDefaultSpecifier',
          local: {
            type: 'Identifier',
            name: defaultDependencyNameMap.get(moduleName) as string,
          },
        })
      }
      importsToInsert.push({
        type: 'ImportDeclaration',
        specifiers: specifiers,
        source: {
          type: 'Literal',
          value: moduleName,
        },
      })
    }
    const statementList = this.getCurrentModuleStatementList() as estree.Program['body']
    if (statementList !== null) {
      statementList.unshift(...importsToInsert)
    }
    if (this.getCurrentModuleName() === 'analytics/looker') {
      console.log(statementList.slice(0, 3))
    }
  }

  getCurrentModuleStatementList() {
    return this.currentModuleDefineNode !== null
      ? this.currentModuleDefineNode.arguments[2].body.body
      : null
  }

  getCurrentModuleName() {
    return this.currentModuleDefineNode !== null
      ? this.currentModuleDefineNode.arguments[0].value
      : null
  }

  constructor(ast: estree.Node, private opts: DeminifyOptions) {
    this.scopeManager = escope.analyze(ast)
    this.currentScope = this.scopeManager.acquire(ast)
  }

  transformEnter(node: estree.Node) {
    // I suggest https://astexplorer.net/ to find the JSON to generate
    // for replacements.
    if (!this.currentModuleDefineNode && isDefineFunc(node, true)) {
      const args = node.arguments
      this.currentModuleDefineNode = node
      this.currentModuleFunctionNode = args[2]
      this.identifiersUsedInCurrentModule = new Set()
      this.moduleIdentifiers = []
      const dependencies = args[1].elements.map((e) => e.value)
      const dependencyNames = args[2].params.map((e) => e.name)
      dependencyNames.forEach((name, i) => {
        // dependencies.length <= dependencyNames always
        this.dependencyMap.set(name, dependencies[i])
      })
    }
    if (shouldUpdateScope(node)) {
      this.currentScope = this.scopeManager.acquire(node)
    }
  }

  transformLeave(node: estree.Node, parent: estree.Node | null) {
    if (shouldUpdateScope(node)) {
      this.currentScope = this.currentScope.upper
    }
    if (
      node === this.currentModuleDefineNode &&
      this.currentModuleFunctionNode !== null
    ) {
      this.insertImports()
      this.identifiersUsedInCurrentModule.clear()
      this.dependencyMap.clear()
      const customProgram: estree.Program = {
        type: 'Program',
        sourceType: 'module',
        body: this.currentModuleFunctionNode.body.body,
      }
      const bodyOut = escodegen.generate(customProgram)
      emit(this.currentModuleDefineNode.arguments[0].value, bodyOut, this.opts)
      this.currentModuleFunctionNode = null
      this.currentModuleDefineNode = null
      this.defineFuncCount += 1
      if (this.defineFuncCount >= this.opts.limit) {
        return estraverse.VisitorOption.Break
      }
    } else if (
      node.type === 'Identifier' &&
      isIdentifierComputed(node, parent)
    ) {
      const nodeDefined = definitionNode(node.name, this.currentScope)
      if (nodeDefined === this.currentModuleFunctionNode) {
        const moduleRequired = this.dependencyMap.get(node.name)
        if (moduleRequired === 'exports') {
          node.name = 'exports'
        } else if (moduleRequired === 'require') {
          node.name = 'require'
        } else if (moduleRequired !== undefined) {
          if (parent !== null && isIdentifierUsedForDefault(node, parent)) {
            this.moduleIdentifiers.push({
              type: 'DefaultRequire',
              memberExpression: parent,
            })
          } else {
            this.moduleIdentifiers.push(node)
          }
        } else {
          // module is not defined as a param in the define()
          // leave untouched
        }
      } else {
        this.identifiersUsedInCurrentModule.add(node.name)
      }
    }
  }
}
