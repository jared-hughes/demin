import * as estree from 'estree'
import * as escope from 'escope'
import * as estraverse from 'estraverse'
import escodegen from 'escodegen'
import { DeminifyOptions } from './deminify'
import { emit } from './lib'

type StringLiteral = { value: string } & estree.Literal

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

export default class Transformer {
  scopeManager: any
  currentScope: any
  defineFuncCount = 0
  dependencyMap: Map<string, string> = new Map()

  constructor(ast: estree.Node, private opts: DeminifyOptions) {
    this.scopeManager = escope.analyze(ast)
    this.currentScope = this.scopeManager.acquire(ast)
  }

  transformEnter(node: estree.Node) {
    // I suggest https://astexplorer.net/ to find the JSON to generate
    // for replacements.
    if (isDefineFunc(node, true)) {
      const args = node.arguments
      const dependencies = args[1].elements.map((e) => e.value)
      const dependencyNames = args[2].params.map((e) => e.name)
      dependencyNames.forEach((name, i) => {
        // dependencies.length <= dependencyNames always
        this.dependencyMap.set(name, dependencies[i])
      })
    } else if (node.type === 'Identifier') {
      // replace identifiers with require`d form if possible
      if (
        this.dependencyMap.has(node.name) &&
        !this.currentScope.set.has(node.name)
      ) {
        return {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: 'require',
          },
          arguments: [
            {
              type: 'Literal',
              value: this.dependencyMap.get(node.name) as string,
            },
          ],
          optional: false,
        } as estree.CallExpression
      }
    } else if (/Function/.test(node.type)) {
      this.currentScope = this.scopeManager.acquire(node)
    }
  }

  transformLeave(node: estree.Node) {
    if (isDefineFunc(node)) {
      const args = node.arguments
      const moduleName = args[0].value
      const functionBlock = node.arguments[2].body
      const customProgram: estree.Program = {
        type: 'Program',
        sourceType: 'module',
        body: functionBlock.body,
      }
      const bodyOut = escodegen.generate(customProgram)
      emit(moduleName, bodyOut, this.opts)
      this.defineFuncCount += 1
      if (this.defineFuncCount >= this.opts.limit) {
        return estraverse.VisitorOption.Break
      }
    } else if (/Function/.test(node.type)) {
      this.currentScope = this.currentScope.upper
    }
  }
}
