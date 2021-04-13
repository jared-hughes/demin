import * as estree from 'estree'
import * as escope from 'escope'
import * as estraverse from 'estraverse'
import escodegen from 'escodegen'
import { DeminifyOptions } from './deminify'
import { emit, clearAssign } from './lib'

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

export default class Transformer {
  scopeManager: any
  currentScope: null | any
  defineFuncCount = 0
  dependencyMap: Map<string, string> = new Map()
  currentModuleDefineNode: DefineFunc | null = null
  // note that we are limiting to FunctionExpression, not Function
  // (which also includes arrow functions + more)
  currentModuleFunctionNode: estree.FunctionExpression | null = null

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
          clearAssign(node, {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'require',
            },
            arguments: [
              {
                type: 'Literal',
                value: moduleRequired,
              },
            ],
            optional: false,
          })
        } else {
          // module is not defined as a param in the define()
          // leave untouched
        }
      }
    }
  }
}
