const { WeaveError } = require('@weave-js/core').Errors;

const ERROR_ORIGIN_NOT_ALLOWED = 'HTTP_ORIGIN_NOT_ALLOWED';

class RateLimitExceededError extends WeaveError {
  constructor () {
    super('Too many requests.', {
      code: 'HTTP_RATE_LIMIT_EXCEEDED'
    });
  }
}

class ForbiddenError extends WeaveError {
  constructor (code, data) {
    super('Forbidden.', {
      code,
      data
    });
  }
}

class NotFoundError extends WeaveError {
  constructor (code, data) {
    super('Not found', {
      code: code || 'HTTP_NOT_FOUND',
      data
    });
  }
}

module.exports = {
  RateLimitExceededError,
  ForbiddenError,
  ERROR_ORIGIN_NOT_ALLOWED,
  NotFoundError
};
