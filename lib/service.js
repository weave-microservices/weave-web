// npm packages
const http = require('http');
const queryString = require('querystring');
const os = require('os');

// const server = require('./server')
const patchRequest = require('./request');
const patchResponse = require('./response');
const { WeaveServiceNotFoundError } = require('@weave-js/core').Errors;

// own packages
const serveStatic = require('serve-static');
const { RateLimitExceededError, NotFoundError } = require('./errors');
const { addSlashes, isReadableStream } = require('./utils');
const { isObject, isFunction, isString, match, isPlainObject } = require('@weave-js/utils');
const { createHandler } = require('./handler');
const { createRoute, parseRouteSchemaString } = require('./route');

module.exports = () => ({
  name: 'weave-web',
  settings: {
    port: 3000,
    ip: '0.0.0.0',
    useHttp2: false,
    requestLogLevel: 'debug',
    handlers: [],
    autoOrderRoutes: true,
    generateRoutesFromActions: false
  },
  events: {
    '$services.changed' () {
      if (this.settings.generateRoutesFromActions) {
        this.regenerateAutoRoutes();
      }
    }
  },
  actions: {
    rest: {
      visibility: 'private',
      handler (context) {
        const { request, response } = context.data;

        this.logRequest(request);

        request.setContext(context);
        response.setContext(context);

        // eslint-disable-next-line
        let { url, query } = request.processQueryString()

        if (url.length > 1 && url.endsWith('/')) {
          url = url.slice(0, -1);
        }

        request.parsedUrl = url;

        if (!request.query) {
          request.query = query;
        }

        if (!this.registeredHandlers || this.registeredHandlers.length === 0) {
          return null;
        }

        const resolvedRoute = this.resolveRoute(url, request.method);

        if (resolvedRoute) {
          const route = resolvedRoute.route;
          return route.routeHandler.handle(context, request, response, resolvedRoute);
        }

        // Undefined routes.
        for (let i = 0; i < this.registeredHandlers.length; i++) {
          const handler = this.registeredHandlers[i];

          if (url.startsWith(handler.path)) {
            return handler.handle(context, request, response);
          }
        }

        return null;
      }
    }
  },
  methods: {
    handleRequest (request, response) {
      request.start();
      request.setService(this);

      // Pass incoming request ID
      let requestId = request.headers['x-request-id'];
      if (request.headers['x-correlation-id']) {
        requestId = request.headers['x-correlation-id'];
      }
      const options = { requestId };

      return this.actions
        .rest({ request, response }, options)
        .then(result => {
          if (result == null) {
            if (this.serve) {
              this.serve(request, response, () => {
                this.send404(request, response);
              });
              return;
            }
            this.send404(request, response);
          }
        })
        .catch(error => {
          this.log.error(error);
          this.sendError(request, response, error);
        });
    },
    addHandler (routeSchema, addToBottom = true) {
      const handler = createHandler(this, routeSchema);
      const routeIndex = this.registeredHandlers.findIndex(r => r.path === handler.path);

      // Is a new route
      if (routeIndex === -1) {
        if (addToBottom) {
          this.registeredHandlers.push(handler);
        } else {
          this.registeredHandlers.unshift(handler);
        }

        // add routes to global storage
        if (handler.routes) {
          this.routes.push(...handler.routes);
        }
      } else {
        // replace the existing route
        this.registeredHandlers[routeIndex] = handler;
      }

      if (this.settings.autoOrderRoutes) {
        this.autoOrderHandlers();
        this.autoOrderRoutes();
      }

      return routeSchema;
    },
    resolveRoute (urlPath, method) {
      for (let index = 0; index < this.routes.length; index++) {
        const route = this.routes[index];

        if (route.method === '*' || route.method === method) {
          const params = route.match(urlPath);

          if (params) {
            return {
              route,
              params: params
            };
          }
        }
      }
      return false;
    },
    autoOrderHandlers () {
      this.registeredHandlers.sort((a, b) => {
        let count = addSlashes(b.path).split('/').length - addSlashes(a.path).split('/').length;

        if (count === 0) {
          count = a.path.split(':').length - b.path.split(':').length;
        }

        if (count === 0) {
          count = a.path.localeCompare(b.path);
        }

        return count;
      });
    },
    autoOrderRoutes () {
      this.routes.sort((a, b) => {
        let count = addSlashes(b.path).split('/').length - addSlashes(a.path).split('/').length;

        if (count === 0) {
          count = a.path.split(':').length - b.path.split(':').length;
        }

        if (count === 0) {
          count = a.path.localeCompare(b.path);
        }

        return count;
      });
    },
    processQueryString (request) {
      let url = request.url;
      let query = {};

      const questionMarkIndex = url.indexOf('?');

      if (questionMarkIndex !== -1) {
        query = queryString.parse(url.substring(questionMarkIndex + 1));
        url = url.substring(0, questionMarkIndex);
      }

      return { url, query };
    },
    preCallAction (request, response, route) {
      const handler = request.$handler;
      const context = request.$context;

      // Check whitelist
      if (route.actionName && handler.hasWhitelist()) {
        if (!this.checkWhitelist(handler, route.actionName)) {
          this.log.debug(`Action ${route.actionName} is not on the whitelist!`);
          return Promise.reject(new WeaveServiceNotFoundError(route.actionName));
        }
      }

      // Rate limiter
      if (handler.rateLimit) {
        const store = handler.rateLimit.store;
        const opts = handler.rateLimit;
        const key = opts.getKey(request);

        if (key) {
          const remainingRequests = opts.limit - store.increment(key);

          // Add optional headers to response
          if (opts.headers) {
            response.setHeader('x-rate-limit-limit', opts.limit);
            response.setHeader('x-rate-limit-window', opts.windowSizeTime);
            response.setHeader('x-rate-limit-remaining', remainingRequests > 0 ? remainingRequests : 0);
          }

          // Reject request
          if (remainingRequests < 0) {
            return Promise.reject(new RateLimitExceededError());
          }
        }
      }

      this.setHeaders(request, response);

      return Promise.resolve()
        .then(() => {
          if (route.actionName) {
            const endpoint = this.runtime.registry.getNextAvailableActionEndpoint(route.actionName);

            if (endpoint instanceof Error) {
              return Promise.reject(endpoint);
            }

            if (endpoint.action.visibility !== null && endpoint.action.visibility === 'private') {
              throw new WeaveServiceNotFoundError(route.actionName);
            }

            request.$endpoint = endpoint;
            request.$action = endpoint.action;
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
            );
          }
        })
        .then(() => {
          if (handler.authorization) {
            return this.authorize(context, request, response);
          }
        })
        .then(() => {
          if (isFunction(route.handler)) {
            return new Promise((resolve, reject) => {
              route.handler.call(this, request, response, error => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              });
            });
          }
        })
        .then(() => {
          if (route.actionName) {
            return this.callAction(
              route,
              route.actionName,
              request.$params,
              handler,
              request,
              response
            );
          }
        });
    },
    async callAction (route, actionName, params, handler, request, response) {
      // let endpoint
      const context = request.$context;

      try {
        let data = await context.call(request.$endpoint, params, route.callOptions);

        if (handler.afterRequest) {
          data = await handler.afterRequest.call(this, context, handler, request, response, data);
        }

        this.sendResponse(
          context,
          request,
          response,
          request.$action,
          data
        );

        if (handler.logging.enabled) {
          this.logResponse(request, response, context, data);
        }
        return true;
      } catch (error) {
        if (!error) {
          return;
        }
        throw error;
      }
    },
    setHeaders (request, response) {
      if (!response.getHeader('Connection')) {
        response.setHeader('Connection', request.isKeepAlive() ? 'keep-alive' : 'close');
      }
    },
    sendResponse (context, request, response, action, data) {
      let responseType;
      let result;

      if (response.headersSent) {
        this.log.warn('Headers have already sent');
        return;
      }

      response.statusCode = 200;

      if (context.meta.$statusCode) {
        response.statusCode = context.meta.$statusCode;
      }

      if (context.meta.$statusMessage) {
        response.statusMessage = context.meta.$statusMessage;
      }

      if (context.meta.$responseType) {
        responseType = context.meta.$responseType;
      }

      // Set response headers from context meta
      if (context.meta.$responseHeaders && isObject(context.meta.$responseHeaders)) {
        Object.keys(context.meta.$responseHeaders).forEach(key => {
          if (key === 'Content-Type' && !responseType) {
            responseType = context.meta.$responseHeaders[key];
          } else {
            response.setHeader(key, context.meta.$responseHeaders[key]);
          }
        });
      }

      if (data === null || typeof data === 'undefined') {
        return response.end();
      }

      // Result is a buffer
      if (Buffer.isBuffer(data)) {
        response.setHeader('Content-Length', data.length);
        response.setHeader('Content-Type', responseType || 'application/octet-stream');
        result = data;
      } else if (isObject(data) && data.type === 'Buffer') { // Handle seriealized Buffer
        // Buffer from object
        const buffer = Buffer.from(data);

        response.setHeader('Content-Length', buffer.length);
        response.setHeader('Content-Type', responseType || 'application/octet-stream');

        result = buffer;
      } else if (isReadableStream(data)) { // Stream
        response.setHeader('Content-Type', responseType || 'application/octet-stream');
        // Pipe the stream
        result = data;
      } else if (isObject(data) || Array.isArray(data)) { // Object or Array (serialized)
        result = JSON.stringify(data);
        response.setHeader('Content-Type', responseType || 'application/json; charset=UTF-8;');
      } else {
        if (responseType) {
          response.setHeader('Content-Type', responseType);
          if (isString(data)) {
            result = data;
          } else {
            result = data.toString();
          }
        } else {
          result = JSON.stringify(data);
          response.setHeader('Content-Type', 'application/json; charset=UTF-8;');
        }
      }

      // TODO: handle ETag

      // Sanitize headers on 204 and 304
      if (response.statusCode === 204 || response.statusCode === 304) {
        response.removeHeader('Content-Type');
        response.removeHeader('Content-Length');
        response.removeHeader('Transfer-Encoding');
        result = '';
      }

      if (request.method === 'HEAD') {
        // Skip response on HEAD
        response.end();
      } else {
        if (isReadableStream(result)) {
          result.pipe(response);
        } else {
          response.end(result);
        }
      }
    },
    send404 (request, response) {
      this.sendError(request, response, new NotFoundError());
    },
    sendError (request, response, error) {
      if (request.$handler && request.$handler.requestFailed && isFunction(request.$handler.requestFailed)) {
        return request.$handler.requestFailed.call(this, request, response, error);
      }

      if (isFunction(this.settings.requestFailed)) {
        return this.settings.requestFailed.call(this, request, response, error);
      }

      if (!error || !(error instanceof Error)) {
        response.writeHead(500);
        response.end('Internal Server Error');
        // todo: logresponse
        return;
      }

      response.setHeader('Content-type', 'application/json; charset=UTF-8;');

      const code = error.code < 100 ? 500 : error.code || 500;

      response.writeHead(code);
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
      );

      this.logResponse(request, response, error ? error.context : null);
    },
    checkWhitelist (handler, actionName) {
      return !!handler.whitelist.find(mask => {
        return match(actionName, mask);
      });
    },
    logRequest (request) {
      this.log[this.settings.requestLogLevel]({ method: request.method, url: request.url }, `Request: ${request.method} ${request.url}`);
    },
    logResponse (request, response) {
      let durationString = '';

      if (request.$startTime) {
        const hrTime = process.hrtime(request.$startTime);
        const duration = (hrTime[0] + hrTime[1] / 1e9) * 1000;

        if (duration > 1000) {
          durationString = `${Number(duration / 1000).toFixed(3)} s`;
        } else {
          durationString = `${Number(duration).toFixed(3)} ms`;
        }
      }

      this.log[this.settings.requestLogLevel]({ statusCode: response.statusCode, method: request.method, url: request.url, duration: durationString }, `Response: ${response.statusCode} ${request.method} ${request.url} [${durationString}]`, { statusCode: response.statusCode });
    },
    closeAllConnections () {
      Object.entries(this.connections).forEach(([key, connection]) => connection.destroy());
    },
    tryCreateHttp2 () {
      try {
        return require('http2');
      } catch (e) {
        this.broker.fatal('Http2 module is not available. ');
      }
    },
    getServerURI (address) {
      // Handling different operating systems
      const listeningAddress = address.address === '0.0.0.0' && os.platform() === 'win32' ? 'localhost' : address.address;
      return `${this.isHttps ? 'https' : 'http'}://${listeningAddress}:${address.port}`;
    },
    regenerateAutoRoutes () {
      this.registeredHandlers.map(handler => handler.schema.generateAutoRoutes && this.generateAutoRoutes(handler));
    },
    generateAutoRoutes (handler) {
      const services = this.broker.registry.serviceCollection.list({ withActions: true, withSettings: true });

      // remove previous routes for current handler
      this.routes = this.routes.filter(route => route.routeHandler !== handler);

      const handledServices = new Set();

      services.map(service => {
        const serviceName = services.fullName || service.name; // todo generate name from version
        const basePath = service.settings && isString(service.settings.rest) ? service.settings.rest : addSlashes(serviceName);

        // skip already processed services
        if (handledServices.has(serviceName)) return;

        Object.values(service.actions).map(action => {
          // if (action.visibility !== 'published') return;

          if (handler.hasWhitelist() && !this.checkWhitelist(handler, action.name)) {
            return;
          }

          let routeSchema;

          if (isString(action.rest)) {
            const result = parseRouteSchemaString(action.rest);
            routeSchema = {
              method: result.method,
              path: basePath + result.path
            };
          } else if (isPlainObject(action.rest)) {
            routeSchema = {
              method: action.rest.method,
              path: basePath + action.rest.path
            };
          }

          if (routeSchema) {
            this.routes.push(createRoute(handler, routeSchema, action.name));
          }
        });

        handledServices.add(serviceName);
      });

      if (this.settings.autoOrderRoutes) {
        this.autoOrderHandlers();
        this.autoOrderRoutes();
      }
    }
  },
  created () {
    this.connections = {};

    // todo: validate logLevel against available log levels
    // if (this.settings.requestLogLevel) {

    // }

    if (this.settings.https && this.settings.https.key && this.settings.https.cert) {
      if (this.settings.useHttp2) {
        this.server = this.tryCreateHttp2().createServer(
          this.settings.https,
          this.handleRequest
        );
      }

      this.isHttps = true;
    } else {
      this.server = http.createServer();
      this.isHttps = false;

      patchRequest(http.IncomingMessage);
      patchResponse(http.OutgoingMessage);
    }

    // store the connections for a gracefully shutdown.
    this.server.on('connection', socket => {
      const key = socket.remoteAddress + ':' + socket.remotePort;

      this.connections[key] = socket;

      this.log.verbose(`Client has connected: ${key}`);

      socket.on('close', () => {
        this.log.verbose(`Client has disconnected: ${key}`);
        delete this.connections[key];
      });
    });

    this.server.on('request', this.handleRequest);

    if (this.settings.routeCache) {
      this.routeCache = {};
    }

    // Create static file server middleware
    if (this.settings.assets) {
      const options = this.settings.assets.options || {};
      this.serve = serveStatic(this.settings.assets.folder, options);
    }

    // Process routes
    this.registeredHandlers = [];
    this.routes = [];

    let handlerToRegister = [];

    if (this.settings.handlers && this.settings.handlers.length > 0) {
      this.log.warn('The registration of route handlers via the setting object is deprecated. Please use "serviceSchema.handlers[]" instead.');
      handlerToRegister = handlerToRegister.concat(this.settings.handlers);
    }

    // merge deprecated handlers from settings
    if (this.schema.handlers) {
      handlerToRegister = handlerToRegister.concat(this.schema.handlers);
    }

    handlerToRegister.map(handlerSchema => this.addHandler(handlerSchema));

    this.log.info('API Gateway created.');
  },
  started () {
    if (this.settings.runAsMiddleware === true) {
      // todo: implement a middleware handler for express.
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.settings.port, this.settings.ip, (error) => {
        if (error) {
          reject(error);
        }

        const address = this.server.address();
        this.log.info(`API Gateway is listening on ${this.getServerURI(address)}.`);
        resolve();
      });
    });
  },
  stopped () {
    if (this.settings.runAsMiddleware === true) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      if (this.server.listening) {
        this.closeAllConnections();

        this.server.close(error => {
          if (error) {
            this.log.warn(error.message);
            return reject(error.message);
          }

          this.log.info('API Gateway successfully stopped!');
          return resolve();
        });
      }
    });
  }
});
