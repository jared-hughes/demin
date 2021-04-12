import { writeFile } from 'fs/promises'
import * as prettier from 'prettier'
import * as path from 'path'
import mkdirp from 'mkdirp'
import { DeminifyOptions } from './deminify'

export function extractRaw(sourceString: string, node: any) {
  // .slice() doesn't properly handle multi-byte characters, but
  // .substring() does properly.
  return sourceString.substring(node.start, node.end)
}

export async function emit(
  definePath: string,
  body: string,
  opts: DeminifyOptions,
) {
  const outFile = path.join(opts.outputFolder, `${definePath}.js`)
  const outContent = prettier.format(body, {
    semi: false,
    singleQuote: true,
    jsxSingleQuote: true,
    trailingComma: 'none',
    parser: 'babel',
  })
  console.log('Emitting', definePath)
  if (!opts.dry) {
    await mkdirp(path.join(outFile, '..'))
    await writeFile(outFile, outContent)
  }
}
