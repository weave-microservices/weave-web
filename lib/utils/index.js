module.exports = {
  ...require('./add-slashes'),
  ...require('./normalize-path'),
  ...require('./is-readable-stream'),
  ...require('./path-to-regex'),
  ...require('./remove-trailing-slashes'),
  ...require('./wrap-middlewares')
}
