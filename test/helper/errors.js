const { WeaveError } = require('@weave-js/core/lib/errors');

class AuthorizationError extends WeaveError {
  constructor () {
    super('Authorization failed.', {
      code: 'HTTP_AUTHENTICATION_FAILED'
    });
  }
}

module.exports = {
  AuthorizationError
};
