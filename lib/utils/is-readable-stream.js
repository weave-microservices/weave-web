const stream = require('stream')

module.exports.isReadableStream = obj => (obj instanceof stream.Readable && typeof obj._read === 'function' && typeof obj._readableState === 'object')
