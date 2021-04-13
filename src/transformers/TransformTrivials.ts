import * as estree from 'estree'
import { TransformerConstructor } from '../TransformerBase'
import { clearAssign } from '../lib'

export default function TransformTrivials<TBase extends TransformerConstructor>(
  Base: TBase,
) {
  return class TransformsTrivials extends Base {
    constructor(...args: any[]) {
      super(args)
      this.leaveTransformers.push(this.scopeLeaveTransformer.bind(this))
    }

    tryTransformVoid0(node: estree.UnaryExpression) {
      if (
        node.operator === 'void' &&
        node.argument.type === 'Literal' &&
        node.argument.value === 0
      ) {
        // `void 0` → `undefined` (assumes identifier "undefined" was not overwritten)
        clearAssign(node, {
          type: 'Identifier',
          name: 'undefined',
        })
      }
    }

    tryTransformTrueFalse(node: estree.UnaryExpression) {
      if (
        node.operator === '!' &&
        node.argument.type === 'Literal' &&
        (node.argument.value === 0 || node.argument.value === 1)
      ) {
        clearAssign(node, {
          type: 'Literal',
          value: !node.argument.value,
        })
      }
    }

    scopeLeaveTransformer(node: estree.Node) {
      if (node.type === 'UnaryExpression') {
        this.tryTransformVoid0(node)
        this.tryTransformTrueFalse(node)
      }
    }
  }
}
