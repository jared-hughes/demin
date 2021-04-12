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

function isString(expr) {
  return matches(expr, {
    type: 'Literal',
    value: e => typeof e === 'string'
  })
}

module.exports = {
  matches,
  isArrayOf,
  isString
}
