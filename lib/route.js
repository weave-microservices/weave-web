const { isFunction, isString, compact } = require('@weave-js/utils')
const { addSlashes, removeTrailingSlashes, pathToRegexp, wrapMiddlewares } = require('./utils')

module.exports = (routeHandler, schema, action) => {
  let route = {}
  route.method = '*'
  route.routeHandler = routeHandler

  if (isString(schema)) {
    if (schema.indexOf(' ') !== -1) {
      const parts = schema.split(' ')

      route.method = parts[0]
      route.path = parts[1]
    } else {
      route.path = schema
    }
  }

  // if (schema.startsWith('/')) {
  //   route.path = schema.slice(1)
  // }

  // get action
  if (isString(action)) {
    route.actionName = action
  } else if (isFunction(action)) {
    route.handler = action
  } else if (Array.isArray(action)) {
    const middlewares = compact(
      action.map(a => {
        if (isString(a)) {
          route.actionName = a
        } else if (isFunction(a)) {
          return a
        }
      })
    )

    route.handler = wrapMiddlewares(middlewares)
  } else {
    route = action
  }

  const keys = []
  route.path = removeTrailingSlashes(route.path)
  route.fullPath = schema.fullpath || (addSlashes(routeHandler.path) + route.path)
  route.regex = pathToRegexp(route.fullPath, keys, {})

  route.match = url => {
    const params = {}
    const match = route.regex.exec(url)

    if (!match) {
      return false
    }

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const param = match[i + 1]
      params[key.name] = param
    }

    return params
  }

  return route
}
