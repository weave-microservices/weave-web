const { isFunction, isString, compact } = require('lodash')
const { promisify } = require('fachwork')
const { addSlashes, normalizePath } = require('./utils')
const { isObject } = require('@weave-js/utils')
const bodyParser = require('body-parser')
const MemoryRateLimitStore = require('./store/memory')
const { MAPPING_POLICY_ALL, MAPPING_POLICY_RESTRICTED } = require('./constants')
const { pathToRegexp } = require('./utils')
const { WeaveError } = require('@weave-js/core').Errors

module.exports = class Route {
  constructor (service, schema) {
    this.middlewares = []
    this.service = service
    this.schema = schema

    if (schema.authorization) {
      if (!isFunction(service.authorize)) {
        service.log.warn('If you want to use authorization for this route, please define the "authorize" method in this service.')
        this.authorization = false
      } else {
        service.authorize = promisify(this.authorize, { scope: this })
        this.authorization = true
      }
    }

    if (schema.bodyParsers) {
      const bodyParsers = schema.bodyParsers
      Object.keys(bodyParsers).forEach(key => {
        const opts = isObject(bodyParsers[key]) ? bodyParsers[key] : undefined
        if (bodyParsers[key] !== false) {
          this.middlewares.push(bodyParser[key](opts))
        }
      })
    }

    if (service.settings.rateLimit || schema.rateLimit) {
      const opts = Object.assign(
        {
          windowSizeMs: 5000,
          limit: 50,
          headers: false,
          getKey: request => (request.headers['x-forwarded-for'] || request.connection.remoteAddress || request.socket.remoteAddress || request.connection.socket.remoteAddress)
        },
        service.settings.rateLimit,
        this.rateLimit
      )

      this.rateLimit = opts

      if (opts.RateLimitStore) {
        this.rateLimit.store = new opts.RateLimitStore(
          opts.windowSizeMs,
          opts
        )
      } else {
        this.rateLimit.store = new MemoryRateLimitStore(opts.windowSizeMs)
      }
    }

    const globalPath = service.settings.path && service.settings.path !== '/' ? service.settings.path : '/'
    this.path = addSlashes(globalPath) + (schema.path || '/')
    this.path = normalizePath(this.path)

    this.whitelist = schema.whitelist
    // this.hasWhitelist = Array.isArray(schema.whitelist)
    this.mappingPolicy = schema.mappingPolicy || service.settings.mappingPolicy || MAPPING_POLICY_ALL

    // ETag
    this.eTag = schema.eTag != null ? schema.eTag : service.settings.eTag

    const tempMiddlewares = []

    // Add global middlewares
    if (Array.isArray(service.settings.use) && service.settings.use.length > 0) {
      tempMiddlewares.push(...service.settings.use)
    }

    // Add route middlewares
    if (schema.use && Array.isArray(schema.use) && schema.use.length > 0) {
      tempMiddlewares.push(...schema.use)
    }

    // Register middlewares
    if (tempMiddlewares.length > 0) {
      this.middlewares.push(...tempMiddlewares)
      service.log.debug(`${this.middlewares.length} middlewares registered.`)
    }

    // Cors settings
    if (service.settings.cors || schema.cors) {
      this.cors = Object.assign(
        {
          origin: '*',
          methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
        },
        service.settings.cors,
        schema.cors
      )
    }

    // 'beforeRequest' hook is set. Promisify it and add it to the route
    if (isFunction(schema.beforeRequest)) {
      this.beforeRequest = promisify(schema.beforeRequest, { scope: service })
    }

    // 'afterRequest' hook is set. Promisify it and add it to the route
    if (isFunction(schema.afterRequest)) {
      this.afterRequest = promisify(schema.afterRequest, { scope: service })
    }

    // 'requestFailed' hook is set. Promisify it and add it to the route
    if (isFunction(schema.requestFailed)) {
      this.requestFailed = promisify(schema.requestFailed, { scope: service })
    }

    this.buildActionRoutes()
  }

  // create alias action routes
  buildActionRoutes () {
    if (this.schema.aliases && Object.keys(this.schema.aliases).length > 0) {
      this.aliases = []

      Object.keys(this.schema.aliases).forEach(matchPath => {
        // todo: check matchpath for REST
        const action = this.schema.aliases[matchPath]

        this.aliases.push(this.createAliaseRoute(matchPath, action))
      })
    }
  }

  createAliaseRoute (matchPath, action) {
    let method = '*'
    if (matchPath.indexOf(' ') !== -1) {
      const parts = matchPath.split(' ')

      method = parts[0]
      matchPath = parts[1]
    }

    if (matchPath.startsWith('/')) {
      matchPath = matchPath.slice(1)
    }

    const keys = []
    const regex = pathToRegexp(matchPath, keys, {})

    let alias
    if (isString(action)) {
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

    alias.match = url => {
      const match = regex.exec(url)
      if (!match) return false
      const params = {}
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const param = match[i + 1]
        params[key.name] = param
      }
      return params
    }

    return alias
  }

  get hasWhitelist () {
    return Array.isArray(this.whitelist)
  }

  handle (context, request, response) {
    request.setRoute(this)
    response.setRoute(this)

    return new Promise((resolve, reject) => {
      response.once('finish', () => resolve(true))

      return this.wrapMiddlewaresPromisified(request, response, this.middlewares)
        .then(() => {
          let params = {}

          if (this.cors) {
            this.writeCorsHeaders(this, request, response, true)

            if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
              this.writeCorsHeaders(this, request, response, true)

              response.writeHead(204, {
                'Content-Length': '0'
              })

              response.end()
              return true
            }
          }

          // todo: merge params
          const body = request.body ? request.body : {}

          params = Object.assign(params, body, request.query)

          request.$params = params

          let urlPath = request.parsedUrl.slice(this.path.length)

          if (urlPath.startsWith('/')) {
            urlPath = urlPath.slice(1)
          }
          // internal services
          urlPath = urlPath.replace(/~/, '$')

          let actionName = urlPath

          if (this.aliases && this.aliases.length > 0) {
            const result = this.resolveAlias(this, urlPath, request.method)
            // found a matching alias.
            if (result) {
              const alias = result.alias

              this.$alias = alias
              Object.assign(params, result.params)

              return this.service.preCallAction(request, response, alias)
            } else if (this.mappingPolicy === MAPPING_POLICY_RESTRICTED) {
              return null
            }
          } else if (this.mappingPolicy === MAPPING_POLICY_RESTRICTED) {
            return null
          }

          if (!actionName) {
            return null
          }

          actionName = actionName.replace(/\//g, '.')

          return this.service.preCallAction(request, response, { actionName })
        })
        .then(resolve)
        .catch(error => {
          reject(error)
        })
    })
  }

  wrapMiddlewares (middlewares) {
    return (request, response, done) => {
      const next = (error, index) => {
        if (error || index >= middlewares.length) {
          return done.call(this, error)
        }

        middlewares[index].call(this, request, response, error =>
          next(error, index + 1)
        )
      }

      return next(null, 0)
    }
  }

  resolveAlias (route, urlPath, method) {
    for (let aliasIndex = 0; aliasIndex < route.aliases.length; aliasIndex++) {
      const alias = route.aliases[aliasIndex]

      if (alias.method === '*' || alias.method === method) {
        const params = alias.match(urlPath)

        if (params) {
          return {
            alias,
            params: params
          }
        }
      }
    }
    return false
  }

  wrapMiddlewaresPromisified (request, response, middlewares) {
    return new Promise((resolve, reject) => {
      this.wrapMiddlewares(middlewares)(request, response, error => {
        if (error) {
          if (error instanceof WeaveError) {
            return reject(error)
          }

          if (error instanceof Error) {
            return reject(
              new WeaveError(
                error.message,
                error.code || error.state,
                error.type
              )
            )
          }

          return reject(new WeaveError(error))
        }
        resolve()
      })
    })
  }
}
