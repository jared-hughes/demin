import { parse } from 'acorn'
import { rmdir, readFile } from 'fs/promises'
import { matches, isString, isArrayOf } from './match'
import { handleDefineStatement } from './visit'

function isDefineCall(statement: any) {
  return matches(statement, {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'define',
      },
      arguments: [
        isString,
        isArrayOf(isString),
        {
          type: 'FunctionExpression',
          // params: isArrayOf({ type: 'Identifier' })
          // assume function (require, exports, i, etc) {}
        },
      ],
    },
  })
}

function parseSource(source: string) {
  const parsed = parse(source, {
    ecmaVersion: 6,
  })
  return (parsed as any).body
}

export interface DeminifyOptions {
  dry: boolean
  outputFolder: string
  start: number
  end: number
}

async function deminifyFile(definePath: string, opts: DeminifyOptions) {
  opts.dry ??= false
  opts.outputFolder ??= 'output'
  opts.start ??= 0
  opts.end ??= Infinity

  const source = await readFile(definePath)
  // take toString now so that it only has to be done once
  // instead of once for every extractRaw call
  const sourceString = source.toString()

  const parsed = parseSource(sourceString)

  if (!opts.dry) {
    await rmdir(opts.outputFolder, {
      recursive: true,
    })
  }

  let defineIndex = 0
  for (const statement of parsed) {
    if (isDefineCall(statement)) {
      defineIndex += 1
      if (defineIndex >= opts.end) {
        break
      } else if (defineIndex >= opts.start) {
        handleDefineStatement(statement, sourceString, opts)
      }
    }
  }
}

deminifyFile('./calculator.js', {
  outputFolder: 'output',
  dry: false,
  start: 6,
  end: 10,
})
