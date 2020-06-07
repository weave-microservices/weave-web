module.exports.wrapMiddlewares = function wrapMiddlewares (middlewares, scope) {
  return (request, response, done) => {
    const next = (error, index) => {
      if (error || index >= middlewares.length) {
        return done.call(scope, error)
      }

      middlewares[index].call(scope, request, response, error =>
        next(error, index + 1)
      )
    }

    return next(null, 0)
  }
}
