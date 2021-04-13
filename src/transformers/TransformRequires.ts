import * as estree from 'estree'
import Case from 'case'
import TrackScope from './TrackScope'
import { clearAssign, start, end } from '../lib'
import { DefineFunc } from '../TransformerBase'

type DefaultRequireMemberExpression = estree.MemberExpression & {
  object: estree.Identifier
}

interface DefaultRequire {
  type: 'DefaultRequire'
  memberExpression: DefaultRequireMemberExpression
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

function validIdentifierStartCharacter(id: string) {
  return /^[a-zA-Z_$]/.test(id)
}

// Mixin pattern following http://web.archive.org/web/20210304140204/https://www.typescriptlang.org/docs/handbook/mixins.html
export default function TransformRequires<
  TBase extends ReturnType<typeof TrackScope>
>(Base: TBase) {
  return class TransformsRequires extends Base {
    // map from variable name → module name (whose require() result is assigned to that variable)
    dependencyMap: Map<string, string> = new Map()
    identifiersUsedInCurrentModule: Set<string> = new Set()
    moduleIdentifiers: Array<estree.Identifier | DefaultRequire> = []

    constructor(...args: any[]) {
      super(args)
      this.leaveTransformers.push(this.requiresLeaveTransformer.bind(this))
      this.enterModuleTransformers.push(
        this.requiresEnterModuleTransformer.bind(this),
      )
      this.leaveModuleTransformers.push(
        this.requireLeaveModuleTransformer.bind(this),
      )
    }

    getVariableNameForModule(moduleName: string) {
      // Split on `/` to get just get the last part of the path
      // Split on `!` to handle applied loader plugins like 'loadjs!file'
      //   (note: there is no special handling for loader plugins; they just get ignored)
      const parts = moduleName.split(/[!/]/)
      let baseName = parts[parts.length - 1]
      // don't start with a digit; try to prepend earlier components
      // of the require path before giving up and just putting an 'M'
      for (
        let i = parts.length - 2;
        !validIdentifierStartCharacter(baseName) && i >= 0;
        i--
      ) {
        baseName = parts.slice(i).join('-')
      }
      if (!validIdentifierStartCharacter) {
        baseName = 'M-' + baseName
      }
      return this.getClosestAvailableNameTo(baseName)
    }

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
        if (!succeeded && this.opts.logging === 'verbose') {
          console.warn(
            `Duplicate variable, may cause conflicts: ${variableName}`,
          )
        }
      }
      this.identifiersUsedInCurrentModule.add(newName)
      return newName
    }

    requiresEnterModuleTransformer(node: DefineFunc) {
      const args = node.arguments
      this.identifiersUsedInCurrentModule = new Set()
      this.moduleIdentifiers = []
      const dependencies = args[1].elements.map((e) => e.value)
      const dependencyNames = args[2].params.map((e) => e.name)
      dependencyNames.forEach((name, i) => {
        // dependencies.length <= dependencyNames always
        this.dependencyMap.set(name, dependencies[i])
      })
    }

    insertImports() {
      // map from module name → variable referring to module name
      const dependencyNameMap = new Map<string, string>()
      // set of module names used as a non-default import
      const dependenciesUsedAsNonDefault = new Set<string>()
      // same except these would be used as default import (`Name`) instead of Name.doAThing
      const defaultDependencyNameMap = new Map<string, string>()
      // set of module names used as a default import
      const dependenciesUsedAsDefault = new Set<string>()

      const replaceNamespaceRequires = () => {
        for (const node of this.moduleIdentifiers) {
          if (node.type !== 'DefaultRequire') {
            // node must be an estree.Identifier
            const moduleName = this.dependencyMap.get(node.name)
            if (moduleName === undefined) {
              if (this.opts.logging === 'verbose') {
                console.warn(
                  `Unhandled namespace module variable: ${node.name}`,
                )
              }
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
      }

      const replaceDefaultRequires = () => {
        for (const node of this.moduleIdentifiers) {
          if (node.type === 'DefaultRequire') {
            const moduleName = this.dependencyMap.get(
              node.memberExpression.object.name,
            )
            if (moduleName === undefined) {
              if (this.opts.logging === 'verbose') {
                console.warn(
                  `'Unhandled default module variable: ${node.memberExpression.object.name}`,
                )
              }
              continue
            }
            dependenciesUsedAsDefault.add(moduleName)
            let name = defaultDependencyNameMap.get(moduleName)
            if (name === undefined) {
              name = this.getVariableNameForModule(
                moduleName +
                  (dependenciesUsedAsNonDefault.has(moduleName)
                    ? '-default'
                    : ''),
              )
              defaultDependencyNameMap.set(moduleName, name)
            }
            clearAssign(node, {
              type: 'Identifier',
              name: defaultDependencyNameMap.get(moduleName),
            })
          }
        }
      }

      const addImportsToTop = () => {
        const importsToInsert: estree.ImportDeclaration[] = []
        for (const moduleName of new Set([
          ...dependenciesUsedAsDefault,
          ...dependenciesUsedAsNonDefault,
        ])) {
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
      }
      // first pass: all non-default requires
      replaceNamespaceRequires()
      // second pass: all default requires
      // need the first pass before to know if the module is used as a non-default
      // as well as a default import; in this case, need a separate import name
      replaceDefaultRequires()
      // add import statements to top of program
      addImportsToTop()
    }

    requireLeaveModuleTransformer() {
      this.insertImports()
      this.identifiersUsedInCurrentModule.clear()
      this.dependencyMap.clear()
    }

    requiresLeaveTransformer(node: estree.Node, parent: estree.Node | null) {
      if (node.type === 'Identifier' && isIdentifierComputed(node, parent)) {
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
}
