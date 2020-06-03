const { WeaveError } = require('@weave-js/core').Errors

class RateLimitExceededError extends WeaveError {
  constructor () {
    super('Too many requests.', 429)
  }
}

module.exports = { RateLimitExceededError }
