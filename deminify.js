const acorn = require('acorn')
const mkdirp = require('mkdirp')
const { writeFile, rmdir, readFile } = require('fs/promises')
const prettier = require('prettier')

;(async()=>{
const calculatorJSRaw = await readFile('./calculator.js')
const calculatorJSRawString = calculatorJSRaw.toString()

const moduleBody =
  acorn.parse(
    calculatorJSRaw,
    {
      ecmaVersion: 6
    }
  ).body

function matches(obj, pattern) {
  if (typeof pattern === 'function') {
    return pattern(obj)
  } else if (typeof pattern !== 'object') {
    return obj === pattern
  } else {
    for (const key in pattern) {
      if (!(key in obj) || !matches(obj[key], pattern[key])) {
        return false
      }
    }
    return true
  }
}

function isArrayOf(pattern) {
  return obj => {
    if (obj.type !== 'ArrayExpression') {
      return false
    }
    if (!Array.isArray(obj.elements)) {
      return false
    }
    for (const entry of obj.elements) {
      if (!matches(entry, pattern)) {
        return false
      }
    }
    return true
  }
}

function isDefineCall(statement) {
  return matches(statement, {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'define'
      }
    }
  })
}

function isString(expr) {
  return matches(expr, {
    type: 'Literal',
    value: e => typeof e === 'string'
  })
}

async function emit(path, body) {
  console.log('Emitting', path)
  const outFile = `output/${path}.js`
  const outContent = prettier.format(
    body,
    {
      semi: false,
      singleQuote: true,
      jsxSingleQuote: true,
      trailingComma: 'none',
      parser: 'babel',
    }
  )
  await mkdirp(outFile.split('/').slice(0,-1).join('/'))
  await writeFile(outFile, outContent)
}

function extractRaw (node) {
  // .slice() doesn't properly handle multi-byte characters, but
  // .substring() does properly.
  return calculatorJSRawString.substring(node.start, node.end)
}

await rmdir('output', {
  recursive: true
})

const limit = 5
let i=0
for (const statement of moduleBody) {
  if (i >= limit) {
    break
  }
  if (isDefineCall(statement)) {
    let out = []
    const args = statement.expression.arguments
    // assume `define('name/name', ['require', 'exports', 'tslib', ...], function(require, e, i, ...){...})`
    if (matches(args, [
      isString,
      isArrayOf(isString),
      {
        type: 'FunctionExpression',
        // params: isArrayOf({ type: 'Identifier' })
        // assume function (require, exports, i, etc) {}
      }
    ])) {
      const path = args[0].value
      const modulePaths = args[1].elements.map(e => e.value)
      const func = args[2]
      const moduleVariableNames = func.params.map(e => e.name)
      const body = func.body
      out.push(extractRaw(body))
      await emit(path, out.join('\n'))
      i += 1
    }
  }
}
})()
