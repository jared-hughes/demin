import { parse } from 'acorn'
import * as estree from 'estree'
import estraverse from 'estraverse'
import TotalTransformer from './TotalTransformer'

import { rmdir, readFile } from 'fs/promises'

export interface DeminifyOptions {
  dry: boolean
  outputFolder: string
  clean: boolean
  limit: number
  prettier: boolean
  logging: 'none' | 'verbose'
}

export default async function deminifyFile(
  definePath: string,
  opts: DeminifyOptions,
) {
  const source = (await readFile(definePath)).toString()

  if (opts.clean && !opts.dry) {
    await rmdir(opts.outputFolder, {
      recursive: true,
    })
  }

  const parsed = parse(source, {
    ecmaVersion: 6,
  }) as estree.Node
  const transformer = new TotalTransformer(parsed, opts)
  estraverse.traverse(parsed, {
    enter: (node, parent) => transformer.transformEnter(node, parent),
    leave: (node, parent) => transformer.transformLeave(node, parent),
  })
}
