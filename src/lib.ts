import { writeFile } from 'fs/promises'
import * as prettier from 'prettier'
import * as path from 'path'
import * as estree from 'estree'
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
  const outContent = opts.prettier
    ? prettier.format(body, {
        semi: false,
        singleQuote: true,
        jsxSingleQuote: true,
        trailingComma: 'none',
        parser: 'babel',
      })
    : body
  if (opts.logging === 'verbose') {
    console.log('Emitting', definePath)
  }
  if (!opts.dry) {
    await mkdirp(path.join(outFile, '..'))
    await writeFile(outFile, outContent)
  }
}

export function clearAssign(to: any, from: any) {
  for (const prop in to) {
    delete to[prop]
  }
  Object.assign(to, from)
}

// `AcornNode`, `start`, and `end` are introduced to avoid the pain of
// extensive casting because estree.Node does not specify `start` and `end`
// (estree.Node.range is optional annoyingly, creating a need for null checks)

type AcornNode = {
  start: number
  end: number
} & estree.Node

export function start(node: estree.Node) {
  return (node as AcornNode).start
}

export function end(node: estree.Node) {
  return (node as AcornNode).end
}
