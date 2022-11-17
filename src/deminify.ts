import { parse } from 'acorn'
import * as estree from 'estree'
import estraverse from 'estraverse'
import TotalTransformer from './TotalTransformer'
import { rmdir, readFile } from 'fs/promises'
import { emit } from './lib'

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

  for (const line of source.split('\n')) {
    if (line.startsWith('!function(')) {
      // !function() defines are typically some sort of vendor library, e.g. jQuery
      // probably imported as `import "jquery"` instead of `import jquery from "jquery"`
      // Assume quotes are correctly matched etc, and this gives the path for the whole line
      const match = line.match(/define\(['"]([^'"]+)['"]/)
      if (match !== null) {
        const definePath = match[1]
        emit(definePath, line, opts)
      }
    } else {
      // regular define module
      const parsed = parse(line, {
        ecmaVersion: 6,
      }) as estree.Node
      const transformer = new TotalTransformer(parsed, opts)
      estraverse.traverse(parsed, {
        enter: (node, parent) => transformer.transformEnter(node, parent),
        leave: (node, parent) => transformer.transformLeave(node, parent),
      })
    }
  }
}
