const acorn = require('acorn')
const fs = require('fs')
const calculatorJSRaw = fs.readFileSync('./calculator.js')

console.log(
  acorn.parse(
    calculatorJSRaw,
    {
      ecmaVersion: 6
    }
  )
)
