import * as estree from 'estree'
import TrackScope from './transformers/TrackScope'
import * as estraverse from 'estraverse'
import escodegen from 'escodegen'
import { emit } from './lib'
import { DeminifyOptions } from './deminify'

// transformers
import TransformRequires from './transformers/TransformRequires'
import TransformerBase from './TransformerBase'
import TransformTrivials from './transformers/TransformTrivials'

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
  warnOnUnhandled = false,
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

// mixin
export default class TotalTransformer extends TransformTrivials(
  TransformRequires(TrackScope(TransformerBase)),
) {
  constructor(ast: estree.Node, opts: DeminifyOptions) {
    super(ast, opts)
    this.trackScopeFromAST(ast)
    // I don't know why this next line is needed: TransfomerBase
    // declares `public opts`, so presumably it will do this automatically
    this.opts = opts
  }
  transformEnter(node: estree.Node, parent: estree.Node | null) {
    // I suggest https://astexplorer.net/ to find the JSON to generate
    // for replacements.
    if (!this.currentModuleDefineNode && isDefineFunc(node, true)) {
      this.currentModuleDefineNode = node
      this.onEnterModule(node)
    }
    this.enterTransformers.forEach((func) => func(node, parent))
  }

  transformLeave(node: estree.Node, parent: estree.Node | null) {
    if (
      node === this.currentModuleDefineNode &&
      this.currentModuleFunctionNode !== null
    ) {
      this.onLeaveModule()
      // emit
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
    }
    this.leaveTransformers.forEach((func) => func(node, parent))
  }
}
