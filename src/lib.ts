import { writeFile } from 'fs/promises'
import * as prettier from 'prettier'
import * as path from 'path'
import mkdirp from 'mkdirp'
import { DeminifyOptions } from './deminify'

export async function emit(
  definePath: string,
  body: string,
  opts: DeminifyOptions,
) {
  const outFile = path.join(opts.outputFolder, `${definePath}.js`)
  // escodegen is not minified, so is prettier necessary?
  // it certainly changes the output, but is it preferred?
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
