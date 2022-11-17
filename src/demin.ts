#!/usr/bin/env node

import yargs from 'yargs'
import deminifyFile from './deminify'

const options = yargs
  .usage(
    'Deminify a file to a directory.\nUsage: $0 -i <input> -o <output_dir>',
  )
  .options({
    input: {
      alias: 'i',
      describe: 'Input file',
      type: 'string',
      demandOption: true,
    },
    output: {
      alias: 'o',
      describe: 'Output folder (files will be overwritten)',
      type: 'string',
      demandOption: true,
    },
    clean: {
      describe: 'Clean output folder first (no effect if --dry)',
      type: 'boolean',
      default: false,
    },
    dry: {
      describe: "Don't write files",
      type: 'boolean',
      default: false,
    },
    limit: {
      describe: 'Maximum number of files to write out (-1 = output all)',
      type: 'number',
      default: -1,
    },
    prettier: {
      describe: 'Run prettier on the output (slow)',
      type: 'boolean',
      default: false,
    },
    quiet: {
      describe: 'Quiet output',
      type: 'boolean',
      default: false,
    },
  })
  .parseSync()

deminifyFile(options.input, {
  outputFolder: options.output,
  dry: options.dry,
  clean: options.clean,
  limit: options.limit < 0 ? Infinity : options.limit,
  prettier: options.prettier,
  logging: options.quiet ? 'none' : 'verbose',
})
