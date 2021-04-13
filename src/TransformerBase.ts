import * as estree from 'estree'
import { DefineFunc } from './TotalTransformer'
import { DeminifyOptions } from './deminify'

type TransformFunc = (node: estree.Node, parent: estree.Node | null) => void

export default class TransformerBase {
  defineFuncCount = 0
  currentModuleDefineNode: DefineFunc | null = null
  // note that we are limiting to FunctionExpression, not Function
  // (which also includes arrow functions + more)
  currentModuleFunctionNode: estree.FunctionExpression | null = null
  enterTransformers: TransformFunc[] = []
  leaveTransformers: TransformFunc[] = []

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
