import * as estree from 'estree'
import { DeminifyOptions } from './deminify'

type StringLiteral = { value: string } & estree.Literal

export type DefineFunc = {
  arguments: [
    StringLiteral,
    { elements: StringLiteral[] } & estree.ArrayExpression,
    { params: estree.Identifier[] } & estree.FunctionExpression,
  ]
} & estree.CallExpression

type TransformFunc = (node: estree.Node, parent: estree.Node | null) => void
type ModuleFunctionNode = estree.FunctionExpression
type ModuleTransformFunc = (node: DefineFunc) => void

export default class TransformerBase {
  defineFuncCount = 0
  currentModuleDefineNode: DefineFunc | null = null
  // note that we are limiting to FunctionExpression, not Function
  // (which also includes arrow functions + more)
  currentModuleFunctionNode: ModuleFunctionNode | null = null
  enterTransformers: TransformFunc[] = []
  leaveTransformers: TransformFunc[] = []
  enterModuleTransformers: ModuleTransformFunc[] = []
  leaveModuleTransformers: ModuleTransformFunc[] = []

  constructor(public ast: estree.Node, public opts: DeminifyOptions) {}

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
}

export type GConstructor<T = {}> = new (...args: any[]) => T
export type TransformerConstructor = GConstructor<TransformerBase>
