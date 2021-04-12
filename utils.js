const { writeFile } = require('fs/promises')
const prettier = require('prettier')
const path = require('path')
const mkdirp = require('mkdirp')

function extractRaw (sourceString, node) {
  // .slice() doesn't properly handle multi-byte characters, but
  // .substring() does properly.
  return sourceString.substring(node.start, node.end)
}

async function emit (definePath, body, opts) {
  const outFile = path.join(opts.outputFolder, `${definePath}.js`)
  const outContent = prettier.format(
    body,
    {
      semi: false,
      singleQuote: true,
      jsxSingleQuote: true,
      trailingComma: 'none',
      parser: 'babel'
    }
  )
  console.log('Emitting', definePath)
  if (!opts.dry) {
    await mkdirp(path.join(outFile, '..'))
    await writeFile(outFile, outContent)
  }
}

module.exports = {
  extractRaw,
  emit
}
