/* eslint-disable no-undef */
const { pathToRegexp } = require('./utils')

module.exports = class ActionRoute {
  constructor (matchPath, action) {
    this.method = '*'
    this.type = 'call'

    if (matchPath.indexOf(' ') !== -1) {
      const parts = matchPath.split(' ')
      this.method = parts[0]
      matchPath = parts[1]
    }
    if (matchPath.startsWith('/')) {
      matchPath = matchPath.slice(1)
    }

    this.keys = []
    this.regex = pathToRegexp(matchPath, keys, {})

    let alias

    if (isString(action)) {
      this.action = action
      alias = { actionName: action }
    } else if (isFunction(action)) {
      alias = { handler: action }
    } else if (Array.isArray(action)) {
      alias = {}

      const middlewares = compact(
        action.map(a => {
          if (isString(a)) {
            alias.actionName = a
          } else if (isFunction(a)) {
            return a
          }
        })
      )
      
      alias.handler = this.wrapMiddlewares(middlewares)
    } else {
      alias = action
    }

    alias.method = method
    alias.path = matchPath
    alias.regex = regex
  }

  match (url) {
    const match = this.regex.exec(url)

    if (!match) {
      return false
    }

    const params = {}

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const param = match[i + 1]
      params[key.name] = param
    }
    return params
  }
}
