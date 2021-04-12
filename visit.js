import { extractRaw, emit } from './utils'

async function handleDefineStatement (statement, sourceString, opts) {
  const args = statement.expression.arguments
  await handleModuleDefinition(
    args[0].value,
    args[1].elements.map(e => e.value),
    args[2],
    sourceString,
    opts
  )
}

async function handleModuleDefinition (definePath, modulePaths, func, sourceString, opts) {
  const out = []
  const moduleVariableNames = func.params.map(e => e.name)
  const body = func.body
  out.push(extractRaw(sourceString, body))
  console.log(modulePaths, moduleVariableNames)
  await emit(definePath, out.join('\n'), opts)
}

module.exports = {
  handleDefineStatement
}
