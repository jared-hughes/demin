#!/usr/bin/env node

const yargs = require('yargs')
const deminifyFile = require('../dist/deminify').default

const options = yargs
  .usage('Usage: TODO')
  .option('i', {
    alias: 'input',
    describe: 'Input file',
    type: 'string',
    demandOption: true,
  })
  .option('o', {
    alias: 'output',
    describe: 'Output folder (files will be overwritten)',
    type: 'string',
    demandOption: true,
  })
  .option('clean', {
    describe: 'Clean output folder first (no effect if --dry)',
    type: 'boolean',
    default: false,
  })
  .option('dry', {
    describe: "Don't write files",
    type: 'boolean',
    default: false,
  })
  .option('limit', {
    describe: 'Maximum number of files to write out (-1 = output all)',
    type: 'number',
    default: -1,
  })
  .option('prettier', {
    describe: 'Run prettier on the output (slow)',
    type: 'boolean',
    default: false,
  })
  .option('quiet', {
    describe: 'Quiet output',
    type: 'boolean',
    default: false,
  }).argv

deminifyFile(options.input, {
  outputFolder: options.output,
  dry: options.dry,
  clean: options.clean,
  limit: options.limit < 0 ? Infinity : options.limit,
  prettier: options.prettier,
  logging: options.quiet ? 'none' : 'verbose',
})
