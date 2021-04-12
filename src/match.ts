function isPrimitive(obj: any) {
  return (
    typeof obj === 'string' ||
    typeof obj === 'number' ||
    typeof obj === 'boolean'
  )
}

export function matches(
  obj: any,
  pattern: ((obj: any) => boolean) | any[] | any,
) {
  if (typeof pattern === 'function') {
    return pattern(obj)
  } else if (isPrimitive(pattern)) {
    return obj === pattern
  } else if (Array.isArray(pattern)) {
    // specify tuple
    if (!Array.isArray(obj)) {
      return false
    }
    for (let i = 0; i < pattern.length; i++) {
      if (!matches(obj[i], pattern[i])) {
        return false
      }
    }
    return true
  } else {
    if (isPrimitive(obj)) {
      return false
    }
    for (const key in pattern) {
      if (!(key in obj)) {
        return false
      }
      if (!(key in obj) || !matches(obj[key], pattern[key])) {
        return false
      }
    }
    return true
  }
}

export function isArrayOf(pattern: any) {
  return (obj: any) => {
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

export function isString(expr: any) {
  return matches(expr, {
    type: 'Literal',
    value: (obj: any) => typeof obj === 'string',
  })
}
