const fs = require('fs')
const path = require('path')
module.exports = {
  name: 'test',
  actions: {
    test: {
      params: {
        p1: { type: 'number', convert: true },
        p2: { type: 'number', convert: true }
      },
      handler: (context) => {
        return Number(context.data.p1) + Number(context.data.p2)
      }
    },
    hello (context) {
      return 'Hello from ' + context.requestId
    },
    file (context) {
      return fs.createReadStream(path.join(__dirname, '..', 'assets', 'test', 'file'))
    },
    error () {
      throw new Error('Error!!!')
    },
    json () {
      return {
        name: 'Bill',
        age: 12,
        gender: 'male'
      }
    },
    buffer () {
      return Buffer.from('Lorem ipsum bla bla')
    },
    serializedBuffer () {
      return JSON.parse(JSON.stringify(Buffer.from('Lorem ipsum bla bla')))
    },
    jsonWithParams (context) {
      return {
        name: context.data.name,
        age: 12,
        gender: 'male'
      }
    },
    responseHeader (context) {
      context.meta.$responseHeaders = {
        'Content-Type': 'application/pdf',
        'custom-header-field': 'i-am-custom'
      }

      return {
        stream: [1, 2, 3]
      }
    },
    responseType (context) {
      context.meta.$responseType = 'custom/pdf'
      return '[1, 2, 3]'
    },
    responseTypeInt (context) {
      context.meta.$responseType = 'custom/pdf'
      return 5
    },
    statusCode (context) {
      context.meta.$statusCode = 304
      return 5
    }
  }
}
