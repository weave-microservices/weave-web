const { isString } = require('@weave-js/utils')

module.exports.writeCorsHeaders = (handler, request, response, isPreflight) => {
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
}

