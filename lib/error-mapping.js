const { isFunction } = require("@weave-js/utils");

const mapErrors = (error, service) => {
  let statusCode = null;

  switch (error.code) {
  case 'HTTP_ORIGIN_NOT_ALLOWED':
    statusCode = 403;
    break;
  case 'HTTP_NOT_FOUND':
  case 'WEAVE_SERVICE_NOT_FOUND_ERROR':
    statusCode = 404;
    break;
  case 'WEAVE_PARAMETER_VALIDATION_ERROR':
    statusCode = 422;
    break;
  case 'WEAVE_SERVICE_NOT_AVAILABLE_ERROR':
    statusCode = 503;
    break;
  case 'WEAVE_REQUEST_TIMEOUT_ERROR':
    statusCode = 504;
    break;
  case 'HTTP_RATE_LIMIT_EXCEEDED':
  case 'WEAVE_QUEUE_SIZE_EXCEEDED_ERROR':
    statusCode = 429;
    break;
  case 'WEAVE_MAX_CALL_LEVEL_ERROR':
    statusCode = 500;
    break;
  }

  if (!statusCode) {
    if (service.settings.getCustomHttpErrorCode && isFunction(service.settings.getCustomHttpErrorCode)) {
      statusCode = service.settings.getCustomHttpErrorCode.call(service, error);
    }
  }

  if (!statusCode) {
    statusCode = 500;
  }

  return statusCode;
};

module.exports = {
  mapErrors
};
