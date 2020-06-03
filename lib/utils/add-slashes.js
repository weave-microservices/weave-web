module.exports.addSlashes = path => (path.startsWith('/') ? '' : '/') + path + (path.endsWith('/') ? '' : '/')
