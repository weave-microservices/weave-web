const { WeaveError } = require('@weave-js/core').Errors
const { isObject, isFunction, promisify } = require('@weave-js/utils')
const bodyParser = require('body-parser')
const { addSlashes, normalizePath, wrapMiddlewares } = require('./utils')
const { MAPPING_POLICY_RESTRICTED } = require('./constants')
const MemoryRateLimitStore = require('./rate-limiter/memory')
const { createRoute } = require('./route')
const { writeCorsHeaders } = require('./cors')

exports.createHandler = (service, schema) => {
  const handler = Object.create(null)

  const wrapMiddlewaresPromisified = (request, response, middlewares) => {
    return new Promise((resolve, reject) => {
      wrapMiddlewares(middlewares, handler)(request, response, error => {
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

  handler.middlewares = []
  handler.service = service
  handler.schema = schema

  // Merge logging settings
  handler.logging = Object.assign({
    enabled: true,
    requestLogLevel: 'debug',
    responseLogLevel: 'debug'
  }, {
    ...schema.logging
  })

  // Authorization
  if (schema.authorization) {
    if (!isFunction(service.authorize)) {
      service.log.warn('If you want to use authorization for this handler, please define the "authorize" method in this service.')
      handler.authorization = false
    } else {
      service.authorize = promisify(service.authorize, { scope: handler })
      handler.authorization = true
    }
  }

  // Add body parser
  if (schema.bodyParsers) {
    const bodyParsers = schema.bodyParsers
    Object.keys(bodyParsers).forEach(key => {
      const opts = isObject(bodyParsers[key]) ? bodyParsers[key] : undefined
      if (bodyParsers[key] !== false) {
        handler.middlewares.push(bodyParser[key](opts))
      }
    })
  }

  // Rate limiting
  if (service.settings.rateLimit && service.settings.rateLimit.enabled || schema.rateLimit && schema.rateLimit.enabled) {
    const opts = Object.assign(
      {
        windowSizeTime: 5000,
        limit: 50,
        headers: false,
        getKey: request => (request.headers['x-forwarded-for'] || request.connection.remoteAddress || request.socket.remoteAddress || request.connection.socket.remoteAddress)
      },
      service.settings.rateLimit,
      schema.rateLimit
    )

    handler.rateLimit = opts

    // Handle custom rate limit store
    if (opts.RateLimitStore) {
      handler.rateLimit.store = new opts.RateLimitStore(opts.windowSizeTime, opts)
    } else {
      handler.rateLimit.store = new MemoryRateLimitStore(opts.windowSizeMs)
    }
  }

  const globalPath = service.settings.path && service.settings.path !== '/' ? service.settings.path : '/'

  handler.path = addSlashes(globalPath) + (schema.path || '/')
  handler.path = normalizePath(handler.path)

  handler.whitelist = schema.whitelist
  handler.mappingPolicy = schema.mappingPolicy || service.settings.mappingPolicy || MAPPING_POLICY_RESTRICTED

  // ETag
  handler.eTag = schema.eTag != null ? schema.eTag : service.settings.eTag

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
    handler.middlewares.push(...tempMiddlewares)
    service.log.debug(`${handler.middlewares.length} middlewares registered.`)
  }

  // Cors settings
  if (service.settings.cors || schema.cors) {
    handler.cors = Object.assign(
      {
        origin: '*',
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
      },
      // Global settings
      service.settings.cors,
      schema.cors
    )
  }

  // Wire up handler hooks
  // 'beforeRequest' hook is set. Promisify it and add it to the route
  if (isFunction(schema.beforeRequest)) {
    handler.beforeRequest = promisify(schema.beforeRequest, { scope: service })
  }

  // 'afterRequest' hook is set. Promisify it and add it to the route
  if (isFunction(schema.afterRequest)) {
    handler.afterRequest = promisify(schema.afterRequest, { scope: service })
  }

  // 'requestFailed' hook is set. Promisify it and add it to the route
  if (isFunction(schema.requestFailed)) {
    handler.requestFailed = promisify(schema.requestFailed, { scope: service })
  }

  if (schema.routes && Object.keys(schema.routes).length > 0) {
    handler.routes = []

    Object.keys(schema.routes).forEach(matchPath => {
      // todo: check matchpath for REST
      const action = schema.routes[matchPath]

      handler.routes.push(createRoute(handler, matchPath, action))
    })
  }

  handler.hasWhitelist = () => Array.isArray(handler.whitelist)

  handler.handle = (context, request, response, routeResult) => {
    request.setHandler(handler)
    response.setHandler(handler)

    return new Promise((resolve, reject) => {
      response.once('finish', () => resolve(true))

      return wrapMiddlewaresPromisified(request, response, handler.middlewares)
        .then(() => {
          let params = {}

          if (handler.cors) {
            writeCorsHeaders(handler, request, response, true)

            // Is preflight request?
            if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
              // HTTP 204 = No content
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

          let urlPath = request.parsedUrl.slice(handler.path.length)

          if (urlPath.startsWith('/')) {
            urlPath = urlPath.slice(1)
          }
          // internal services
          urlPath = urlPath.replace(/~/, '$')

          let actionName = urlPath

          // found a matching route.
          if (routeResult) {
            const route = routeResult.route
            handler.$route = route
            Object.assign(params, routeResult.params)

            return handler.service.preCallAction(request, response, route)
          } else if (handler.mappingPolicy === MAPPING_POLICY_RESTRICTED) {
            return null
          }

          if (!actionName) {
            return null
          }

          actionName = actionName.replace(/\//g, '.')

          const fakeRoute = { actionName }
          return handler.service.preCallAction(request, response, fakeRoute)
        })
        .then(resolve)
        .catch((error) => {
          reject(error)
        })
    })
  }

  // handler.resolveAlias = (route, urlPath, method) => {
  //   for (let aliasIndex = 0; aliasIndex < route.routes.length; aliasIndex++) {
  //     const alias = route.routes[aliasIndex]

  //     if (alias.method === '*' || alias.method === method) {
  //       const params = alias.match(urlPath)

  //       if (params) {
  //         return {
  //           alias,
  //           params: params
  //         }
  //       }
  //     }
  //   }
  //   return false
  // }

  return handler
}
