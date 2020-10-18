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
    jsonWithParams (context) {
      return {
        name: context.data.name,
        age: 12,
        gender: 'male'
      }
    }
  }
}
