import { extractRaw, emit } from './utils'
import { DeminifyOptions } from './deminify'

export async function handleDefineStatement(
  statement: any,
  sourceString: string,
  opts: DeminifyOptions,
) {
  const args = statement.expression.arguments
  // const info = {
  //   ...opts,
  //   source: sourceString
  // }
  const definePath = args[0].value
  const modulePaths = args[1].elements.map((e: any) => e.value)
  const func = args[2]
  const moduleVariableNames = func.params.map((e: any) => e.name)
  const body = func.body
  console.log(modulePaths, moduleVariableNames)
  await emit(definePath, extractRaw(sourceString, body), opts)
}
