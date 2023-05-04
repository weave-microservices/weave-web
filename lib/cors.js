const { isString } = require('@weave-js/utils');
const { escapeRegex } = require('./utils');
const { ForbiddenError, ERROR_ORIGIN_NOT_ALLOWED } = require('./errors');

/**
* Check origin
* @param {string} origin Origin
* @param {string|Array<string>} settings Origin settings
* @returns {boolean} Match?
*/
const checkOrigin = (origin, settings) => {
  if (isString(settings)) {
    if (settings.indexOf(origin) !== -1) {
      return true;
    }

    if (settings.indexOf('*') !== -1) {
      const wildcard = new RegExp(`^${escapeRegex(settings).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`);
      return origin.match(wildcard);
    }
  } else if (Array.isArray(settings)) {
    for (let i = 0; i < settings.length; i++) {
      if (checkOrigin(origin, settings[i])) {
        return true;
      }
    }
  }

  return false;
};

exports.writeCorsHeaders = (handler, request, response, isPreflight) => {
  if (!handler.cors) {
    return;
  }

  const origin = request.headers['origin'];

  if (!origin) {
    return;
  }

  // Access-Control-Allow-Origin
  if (!handler.cors.origin || handler.cors.origin === '*') {
    response.setHeader('Access-Control-Allow-Origin', '*');
  } else if (checkOrigin(origin, handler.cors.origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  } else {
    throw new ForbiddenError(ERROR_ORIGIN_NOT_ALLOWED);
  }

  // Access-Control-Allow-Credentials
  if (handler.cors.credentials === true) {
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Access-Control-Expose-Headers
  if (isString(handler.cors.exposedHeaders)) {
    response.setHeader('Access-Control-Expose-Headers', handler.cors.exposedHeaders);
  } else if (Array.isArray(handler.cors.exposedHeaders)) {
    response.setHeader('Access-Control-Expose-Headers', handler.cors.exposedHeaders.join(', '));
  }

  if (isPreflight) {
    // Access-Control-Allow-Headers
    if (isString(handler.cors.allowedHeaders)) {
      response.setHeader('Access-Control-Allow-Headers', handler.cors.allowedHeaders);
    } else if (Array.isArray(handler.cors.allowedHeaders)) {
      response.setHeader('Access-Control-Allow-Headers', handler.cors.allowedHeaders.join(', '));
    } else {
      // AllowedHeaders aren't specified, so we take the request headers
      const allowedHeaders = request.headers['access-control-request-headers'];

      if (allowedHeaders) {
        response.setHeader('Vary', 'Access-Control-Request-Headers');
        response.setHeader('Access-Control-Allow-Headers', allowedHeaders);
      }
    }

    // Access-Control-Allow-Methods
    if (isString(handler.cors.methods)) {
      response.setHeader('Access-Control-Allow-Methods', handler.cors.methods);
    } else if (Array.isArray(handler.cors.methods)) {
      response.setHeader('Access-Control-Allow-Methods', handler.cors.methods.join(', '));
    }

    // Access-Control-Max-Age
    if (handler.cors.maxAge) {
      response.setHeader('Access-Control-Max-Age', handler.cors.maxAge.toString());
    }
  }
};

