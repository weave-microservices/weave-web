const fs = require('fs')

module.exports = {
  name: 'test',
  actions: {
    test: {
      params: {
        p1: { type: 'number', convert: true },
        p2: { type: 'number', convert: true }
      },
      handler: (context) => {
        return Number(context.params.p1) + Number(context.params.p2)
      }
    },
    hello (context) {
      return 'Hello from ' + context.requestId
    },
    file (context) {
      return fs.createReadStream('')
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
    jsonWithParams (context) {
      return {
        name: context.params.name,
        age: 12,
        gender: 'male'
      }
    }
  }
}
