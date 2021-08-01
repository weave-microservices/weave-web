const { WeaveError } = require('@weave-js/core').Errors

const ERROR_ORIGIN_NOT_ALLOWED = 'ORIGIN_NOT_ALLOWED'

class RateLimitExceededError extends WeaveError {
  constructor () {
    super('Too many requests.', 429)
  }
}

class ForbiddenError extends WeaveError {
  constructor (type, data) {
    super('Forbidden.', 403, type, data)
  }
}

class NotFoundError extends WeaveError {
  constructor (type, data) {
    super('Not found', 404, type || 'NOT_FOUND', data)
  }
}

module.exports = {
  RateLimitExceededError,
  ForbiddenError,
  ERROR_ORIGIN_NOT_ALLOWED,
  NotFoundError
}
