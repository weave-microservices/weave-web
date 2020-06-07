// npm packages
const http = require('http')
const queryString = require('querystring')
const os = require('os')

// const server = require('./server')
const patchRequest = require('./request')
const patchResponse = require('./response')
const { isFunction, isString } = require('lodash')
const { match } = require('fachwork')
const { WeaveServiceNotFoundError } = require('@weave-js/core').Errors

// own packages
const serveStatic = require('serve-static')
const { RateLimitExceededError } = require('./errors')
const { addSlashes, isReadableStream, colorizeHttpCode } = require('./utils')
const { isObject } = require('@weave-js/utils')
const Handler = require('./handler')

module.exports = () => ({
  name: 'weave-web',
  settings: {
    port: 3000,
    ip: '0.0.0.0',
    useHttp2: false,
    routing: {
      historyMode: false
    },
    handlers: [
      {
        path: '/',
        bodyParsers: {
          json: true
        }
      }
    ],
    autoOrderRoutes: true
  },
  events: {
    '$services.changed' () {
      // todo generate routes from action schema
    }
  },
  actions: {
    rest: {
      visibility: 'private',
      handler (context) {
        const { request, response } = context.params

        this.logRequest(request)

        request.setContext(context)
        response.setContext(context)

        // eslint-disable-next-line
        let { url, query } = request.processQueryString()

        if (url.length > 1 && url.endsWith('/')) {
          url = url.slice(0, -1)
        }

        request.parsedUrl = url

        if (!request.query) {
          request.query = query
        }

        if (!this.handlers || this.handlers.length === 0) {
          return null
        }

        const resolvedRoute = this.resolveRoute(url, request.method)

        if (resolvedRoute) {
          const route = resolvedRoute.route
          return route.routeHandler.handle(context, request, response, resolvedRoute)
        }

        for (let i = 0; i < this.handlers.length; i++) {
          const handler = this.handlers[i]

          if (url.startsWith(handler.path)) {
            return handler.handle(context, request, response)
          }
        }

        return null
      }
    }
  },
  methods: {
    handleRequest (request, response) {
      request.start()
      request.setService(this)

      return this.actions
        .rest({ request, response })
        .then(result => {
          if (result == null) {
            if (this.serve) {
              this.serve(request, response, () => {
                // if (this.settings.routing.historyMode) {
                //     return returnFile(this.settings.assets.folder + '/index.html')
                // }
                this.send404(response)
              })
              return
            }
            this.send404(response)
          }
        })
        .catch(error => {
          this.log.error(error.message)
          this.sendError(request, response, error)
        })
    },
    writeCorsHeaders (handler, request, response, isPreflight) {
      if (!handler.cors) {
        return
      }

      // Access-Control-Allow-Origin
      if (!handler.cors.origin || handler.cors.origin === '*') {
        response.setHeader('Access-Control-Allow-Origin', '*')
      } else if (isString(handler.cors.origin)) {
        response.setHeader('Access-Control-Allow-Origin', handler.cors.origin)
        response.setHeader('Vary', 'Origin')
      } else if (Array.isArray(handler.cors.origin)) {
        response.setHeader('Access-Control-Allow-Origin', handler.cors.origin.join(', '))
        response.setHeader('Vary', 'Origin')
      }

      // Access-Control-Allow-Credentials
      if (handler.cors.credentials === true) {
        response.setHeader('Access-Control-Allow-Credentials', 'true')
      }

      // Access-Control-Expose-Headers
      if (isString(handler.cors.exposedHeaders)) {
        response.setHeader('Access-Control-Expose-Headers', handler.cors.exposedHeaders)
      } else if (Array.isArray(handler.cors.exposedHeaders)) {
        response.setHeader('Access-Control-Expose-Headers', handler.cors.exposedHeaders.join(', '))
      }

      if (isPreflight) {
        // Access-Control-Allow-Headers
        if (isString(handler.cors.allowedHeaders)) {
          response.setHeader('Access-Control-Allow-Headers', handler.cors.allowedHeaders)
        } else if (Array.isArray(handler.cors.allowedHeaders)) {
          response.setHeader('Access-Control-Allow-Headers', handler.cors.allowedHeaders.join(', '))
        } else {
          // AllowedHeaders aren't specified, so we take the request headers
          const allowedHeaders = request.headers['access-control-request-headers']

          if (allowedHeaders) {
            response.setHeader('Vary', 'Access-Control-Request-Headers')
            response.setHeader('Access-Control-Allow-Headers', allowedHeaders)
          }
        }

        // Access-Control-Allow-Methods
        if (isString(handler.cors.methods)) {
          response.setHeader('Access-Control-Allow-Methods', handler.cors.methods)
        } else if (Array.isArray(handler.cors.methods)) {
          response.setHeader('Access-Control-Allow-Methods', handler.cors.methods.join(', '))
        }

        // Access-Control-Max-Age
        if (handler.cors.maxAge) {
          response.setHeader('Access-Control-Max-Age', handler.cors.maxAge.toString())
        }
      }
    },
    addHandler (routeSchema, addToBottom = true) {
      const handler = new Handler(this, routeSchema)
      const routeIndex = this.handlers.findIndex(r => r.path === handler.path)

      // Is a new route
      if (routeIndex === -1) {
        if (addToBottom) {
          this.handlers.push(handler)
        } else {
          this.handlers.unshift(handler)
        }

        // add routes to global storage
        if (handler.routes) {
          this.routes.push(...handler.routes)
        }
      } else {
        // replace the existing route
        this.handlers[routeIndex] = handler
      }

      if (this.settings.autoOrderRoutes) {
        this.autoOrderHandlers()
        this.autoOrderRoutes()
      }

      return routeSchema
    },
    resolveRoute (urlPath, method) {
      for (let index = 0; index < this.routes.length; index++) {
        const route = this.routes[index]

        if (route.method === '*' || route.method === method) {
          const params = route.match(urlPath)

          if (params) {
            return {
              route,
              params: params
            }
          }
        }
      }
      return false
    },
    autoOrderHandlers () {
      this.handlers.sort((a, b) => {
        let count = addSlashes(b.path).split('/').length - addSlashes(a.path).split('/').length

        if (count === 0) {
          count = a.path.split(':').length - b.path.split(':').length
        }

        if (count === 0) {
          count = a.path.localeCompare(b.path)
        }

        return count
      })
    },
    autoOrderRoutes () {
      this.routes.sort((a, b) => {
        let count = addSlashes(b.path).split('/').length - addSlashes(a.path).split('/').length

        if (count === 0) {
          count = a.path.split(':').length - b.path.split(':').length
        }

        if (count === 0) {
          count = a.path.localeCompare(b.path)
        }

        return count
      })
    },
    processQueryString (request) {
      let url = request.url
      let query = {}

      const questionMarkIndex = url.indexOf('?')

      if (questionMarkIndex !== -1) {
        query = queryString.parse(url.substring(questionMarkIndex + 1))
        url = url.substring(0, questionMarkIndex)
      }

      return { url, query }
    },
    preCallAction (request, response, route) {
      const handler = request.$handler
      const context = request.$context

      // Check whitelist
      if (route.actionName && handler.hasWhitelist) {
        if (!this.checkWhitelist(handler, route.actionName)) {
          this.log.debug(`Action ${route.actionName} is not on the whitelist!`)
          return Promise.reject(new WeaveServiceNotFoundError(route.actionName))
        }
      }

      // Rate limiter
      if (handler.rateLimit) {
        const store = handler.rateLimit.store
        const opts = handler.rateLimit
        const key = opts.getKey(request)

        if (key) {
          const remainingRequests = opts.limit - store.increment(key)

          // Add optional headers to response
          if (opts.headers) {
            response.setHeader('X-Rate-Limit-Limit', opts.limit)
            response.setHeader('X-Rate-Limit-Window', opts.windowSizeMs)
            response.setHeader('X-Rate-Limit-Remainung', remainingRequests > 0 ? remainingRequests : 0)
          }

          // Reject request
          if (remainingRequests < 0) {
            return Promise.reject(new RateLimitExceededError())
          }
        }
      }

      this.setHeaders(request, response)

      return Promise.resolve()
        .then(() => {
          if (route.actionName) {
            const endpoint = this.broker.getNextActionEndpoint(route.actionName)

            if (endpoint instanceof Error) {
              return Promise.reject(endpoint)
            }

            if (endpoint.action.visibility !== null && endpoint.action.visibility === 'private') {
              throw new WeaveServiceNotFoundError(route.actionName)
            }

            request.$endpoint = endpoint
            request.$action = endpoint.action
          }
        })
        .then(() => {
          if (handler.beforeRequest) {
            return handler.beforeRequest.call(
              this,
              context,
              handler,
              request,
              response
            )
          }
        })
        .then(() => {
          if (handler.authorization) {
            return this.authorize(context, request, response)
          }
        })
        .then(() => {
          if (isFunction(route.handler)) {
            return new Promise((resolve, reject) => {
              route.handler.call(this, request, response, error => {
                if (error) {
                  reject(error)
                } else {
                  resolve()
                }
              })
            })
          }
        })
        .then(() => {
          if (route.actionName) {
            return this.callAction(
              route.actionName,
              request.$params,
              handler,
              request,
              response
            )
          }
        })
    },
    callAction (actionName, params, handler, request, response) {
      // let endpoint
      const context = request.$context

      return Promise.resolve()
        .then(() => this.log.debug(`Call action: ${actionName}`))
        .then(() => context.call(actionName, params, {}))
        .then(data => {
          if (handler.afterRequest) {
            return handler.afterRequest(context, handler, request, response, data)
          }

          return data
        })
        .then(data => {
          this.sendResponse(
            context,
            request,
            response,
            request.$action,
            data
          )

          this.logResponse(request, response, context, data)
          return true
        })
    },
    setHeaders (request, response) {
      if (!response.getHeader('Connection')) {
        response.setHeader('Connection', request.isKeepAlive() ? 'keep-alive' : 'close')
      }
    },
    sendResponse (context, request, response, action, data) {
      let responseType
      let result

      if (response.headersSent) {
        this.log.warn('Headers have already sent')
        return
      }

      response.statusCode = 200

      if (context.meta.$statusCode) {
        response.statusCode = context.meta.$statusCode
      }

      if (context.meta.$statusMessage) {
        response.statusMessage = context.meta.$statusMessage
      }

      if (context.meta.$responseType) {
        responseType = context.meta.$responseType
      }

      if (data === null || typeof data === 'undefined') {
        return response.end()
      }

      // Result is a buffer
      if (Buffer.isBuffer(data)) {
        response.setHeader('Content-Length', data.length)
        response.setHeader('Content-Type', responseType || 'application/octet-stream')
        result = data
      } else if (isObject(data) && data.type === 'buffer') {
        // Buffer from object
        const buffer = new Buffer(data)

        response.setHeader('Content-Length', buffer.length)
        response.setHeader('Content-Type', responseType || 'application/octet-stream')

        result = buffer
      } else if (isReadableStream(data)) {
        // Stream
        response.setHeader('Content-Type', responseType || 'application/octet-stream')

        result = data
      } else if (isObject(data) || Array.isArray(data)) {
        // Object or Array (serialized)
        result = JSON.stringify(data)
        response.setHeader('Content-Type', responseType || 'application/json; charset=UTF-8;')
      } else {
        if (responseType) {
          response.setHeader('Content-Type', responseType)
          if (isString(data)) {
            result = data
          } else {
            result = data.toString()
          }
        } else {
          result = JSON.stringify(data)
          response.setHeader('Content-Type', 'application/json; charset=UTF-8;')
        }
      }

      if (request.method === 'HEAD') {
        response.end()
      } else {
        if (isReadableStream(result)) {
          result.pipe(response)
        } else {
          response.end(result)
        }
      }
    },
    send404 (response) {
      response.writeHead(404)
      response.end('Not found')
    },
    sendError (request, response, error) {
      if (request.$handler.requestFailed && isFunction(request.$handler.requestFailed)) {
        return request.$handler.requestFailed.call(this, request, response, error)
      }

      if (isFunction(this.settings.requestFailed)) {
        return this.settings.requestFailed.call(this, request, response, error)
      }

      if (!error || !(error instanceof Error)) {
        response.writeHead(500)
        response.end('Internal Server Error')
        // todo: logresponse
        return
      }

      response.setHeader('Content-type', 'application/json; charset=UTF-8;')

      const code = error.code < 100 ? 500 : error.code || 500

      response.writeHead(code)
      response.end(
        JSON.stringify(
          {
            name: error.name,
            code: code,
            message: error.message,
            data: error.data
          },
          null,
          4
        )
      )

      this.logResponse(request, response, error ? error.context : null)
    },
    checkWhitelist (route, actionName) {
      return !!route.whitelist.find(mask => {
        const e = match(actionName, mask)
        return e
      })
    },
    logRequest (request) {
      this.log.debug(`=> ${request.method} ${request.url}`)
    },
    logResponse (request, response) {
      let durationString = ''

      if (request.$startTime) {
        const hrTime = process.hrtime(request.$startTime)
        const duration = (hrTime[0] + hrTime[1] / 1e9) * 1000

        if (duration > 1000) {
          durationString = `[${Number(duration / 1000).toFixed(3)} s]`
        } else {
          durationString = `[${Number(duration).toFixed(3)} ms]`
        }
      }

      this.log.debug(`<= ${colorizeHttpCode(response.statusCode)} ${request.method} ${request.url} ${durationString}`)
    },
    closeAllConnections () {
      Object.entries(this.connections).forEach(([key, connection]) => connection.destroy())
    },
    tryCreateHttp2 () {
      try {
        return require('http2')
      } catch (e) {
        this.broker.fatal('Http2 module is not available. ')
      }
    },
    getServerURI (address) {
      // Handling different operating systems
      const listeningAddress = address.address === '0.0.0.0' && os.platform() === 'win32' ? 'localhost' : address.address
      return `${this.isHttps ? 'https' : 'http'}://${listeningAddress}:${address.port}`
    }
  },

  created () {
    this.connections = {}
    if (this.settings.https && this.settings.https.key && this.settings.https.cert) {
      if (this.settings.useHttp2) {
        this.server = this.tryCreateHttp2().createServer(
          this.settings.https,
          this.handleRequest
        )
      }

      this.isHttps = true
    } else {
      this.server = http.createServer()
      this.isHttps = false

      patchRequest(http.IncomingMessage)
      patchResponse(http.OutgoingMessage)
    }

    // this.server.on('error', error => {
    //   this.log.error('Server error', error)
    // })

    // store the connections for a gracefully shutdown.
    this.server.on('connection', socket => {
      const key = socket.remoteAddress + ':' + socket.remotePort

      this.connections[key] = socket

      this.log.trace(`Client has connected: ${key}`)

      socket.on('close', () => {
        this.log.trace(`Client has disconnected: ${key}`)
        delete this.connections[key]
      })
    })

    this.server.on('request', this.handleRequest)

    if (this.settings.routeCache) {
      this.routeCache = {}
    }

    // Create static file server middleware
    if (this.settings.assets) {
      const options = this.settings.assets.options || {}
      this.serve = serveStatic(this.settings.assets.folder, options)
    }

    // Process routes
    this.handlers = []
    this.routes = []

    if (this.settings.handlers) {
      this.settings.handlers.map(route => this.addHandler(route))
    }

    this.log.info('API Gateway created.')
  },
  started () {
    if (this.settings.runAsMiddleware === true) {
      // todo: implement a middleware handler for express.
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.settings.port, this.settings.ip, error => {
        if (error) {
          reject(error)
        }

        const address = this.server.address()
        this.log.info(`API Gateway is listening on ${this.getServerURI(address)}`)
        resolve()
      })
    })
  },
  stopped () {
    if (this.settings.runAsMiddleware === true) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      if (this.server.listening) {
        this.closeAllConnections()

        this.server.close(error => {
          if (error) {
            this.log.warn(error.message)
            return reject(error.message)
          }

          this.log.info('API Gateway successfully stopped!')
          return resolve()
        })
      }
    })
  }
})
