const acorn = require('acorn')
const { rmdir, readFile } = require('fs/promises')
const { matches, isString, isArrayOf } = require('./match')
const { handleDefineStatement } = require('./visit')

function isDefineCall (statement) {
  return matches(statement, {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'define'
      },
      arguments: [
        isString,
        isArrayOf(isString),
        {
          type: 'FunctionExpression'
          // params: isArrayOf({ type: 'Identifier' })
          // assume function (require, exports, i, etc) {}
        }
      ]
    }
  })
}

function parseSource (source) {
  return acorn.parse(
    source,
    {
      ecmaVersion: 6
    }
  ).body
}

async function deminifyFile (definePath, opts) {
  /*
   * opts:
   *   dry: boolean = false
   *   outputFolder: string (path) = 'output'
   *   start: number = 0
   *   end: number = Infinity
   */
  opts.dry ??= false
  opts.outputFolder ??= 'output'
  opts.start ??= 0
  opts.end ??= Infinity

  const source = await readFile(definePath)
  // take toString now so that it only has to be done once
  // instead of once for every extractRaw call
  const sourceString = source.toString()

  const parsed = parseSource(source)

  if (!opts.dry) {
    await rmdir('output', {
      recursive: true
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
  end: 10
})
