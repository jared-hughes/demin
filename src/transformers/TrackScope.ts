import * as estree from 'estree'
import { TransformerConstructor } from '../TransformerBase'
import * as escope from 'escope'

function shouldUpdateScope(node: estree.Node) {
  return /Function/.test(node.type)
}

export default function TrackScope<TBase extends TransformerConstructor>(
  Base: TBase,
) {
  return class TracksScope extends Base {
    scopeManager: any
    currentScope: null | any

    constructor(...args: any[]) {
      super(args)
      this.enterTransformers.push(this.scopeEnterTransformer.bind(this))
      this.leaveTransformers.push(this.scopeLeaveTransformer.bind(this))
    }

    trackScopeFromAST(ast: estree.Node) {
      this.scopeManager = escope.analyze(ast)
      this.currentScope = this.scopeManager.acquire(ast)
    }

    scopeEnterTransformer(node: estree.Node) {
      if (shouldUpdateScope(node)) {
        this.currentScope = this.scopeManager.acquire(node)
      }
    }

    scopeLeaveTransformer(node: estree.Node) {
      if (shouldUpdateScope(node)) {
        this.currentScope = this.currentScope.upper
      }
    }
  }
}
