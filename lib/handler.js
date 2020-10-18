const { WeaveError } = require('@weave-js/core').Errors
const { isObject, isFunction, promisify } = require('@weave-js/utils')
const bodyParser = require('body-parser')
const { addSlashes, normalizePath, wrapMiddlewares } = require('./utils')
const { MAPPING_POLICY_ALL, MAPPING_POLICY_RESTRICTED } = require('./constants')
const MemoryRateLimitStore = require('./store/memory')
const { createRoute } = require('./route')

module.exports = class Handler {
  constructor (service, schema) {
    this.middlewares = []
    this.service = service
    this.schema = schema

    // Authorization
    if (schema.authorization) {
      if (!isFunction(service.authorize)) {
        service.log.warn('If you want to use authorization for this route, please define the "authorize" method in this service.')
        this.authorization = false
      } else {
        service.authorize = promisify(service.authorize, { scope: this })
        this.authorization = true
      }
    }

    // Add body parser
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
        this.rateLimit.store = new opts.RateLimitStore(opts.windowSizeMs, opts)
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

    // Wire up handler hooks
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

    this.buildRoutes()
  }

  // create alias action routes
  buildRoutes () {
    if (this.schema.routes && Object.keys(this.schema.routes).length > 0) {
      this.routes = []

      Object.keys(this.schema.routes).forEach(matchPath => {
        // todo: check matchpath for REST
        const action = this.schema.routes[matchPath]

        this.routes.push(createRoute(this, matchPath, action))
      })
    }
  }

  get hasWhitelist () {
    return Array.isArray(this.whitelist)
  }

  handle (context, request, response, routeResult) {
    request.setHandler(this)
    response.setHandler(this)

    return new Promise((resolve, reject) => {
      response.once('finish', () => resolve(true))

      return this.wrapMiddlewaresPromisified(request, response, this.middlewares)
        .then(() => {
          let params = {}

          if (this.cors) {
            this.service.writeCorsHeaders(this, request, response, true)

            if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
              this.service.writeCorsHeaders(this, request, response, true)

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

          if (routeResult) {
            // found a matching route.
            const route = routeResult.route
            this.$route = route
            Object.assign(params, routeResult.params)

            return this.service.preCallAction(request, response, route)
          } else if (this.mappingPolicy === MAPPING_POLICY_RESTRICTED) {
            return null
          }

          if (!actionName) {
            return null
          }

          actionName = actionName.replace(/\//g, '.')

          const fakeRoute = { actionName }
          return this.service.preCallAction(request, response, fakeRoute)
        })
        .then(resolve)
        .catch(error => {
          reject(error)
        })
    })
  }

  resolveAlias (route, urlPath, method) {
    for (let aliasIndex = 0; aliasIndex < route.routes.length; aliasIndex++) {
      const alias = route.routes[aliasIndex]

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
      wrapMiddlewares(middlewares, this)(request, response, error => {
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
