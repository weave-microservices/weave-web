const queryString = require('qs')

const patch = Request => {
  Request.prototype.start = function prepareRequest () {
    this.$startTime = process.hrtime()
  }

  Request.prototype.setContext = function setContext (context) {
    this.$context = context
  }

  Request.prototype.setService = function setService (service) {
    this.$service = service
  }

  Request.prototype.setRoute = function setRoute (route) {
    this.$route = route
  }

  Request.prototype.isKeepAlive = function isKeepAlive () {
    if (this.$keepAlive !== undefined) {
      return this.$keepAlive
    }

    if (this.headers.connection) {
      this.$keepAlive = /keep-alive/i.test(this.headers.connection)
    } else {
      this.$keepAlive = this.httpVersion !== '1.0'
    }

    return this.$keepAlive
  }

  Request.prototype.processQueryString = function processQueryString (request) {
    let url = this.url
    let query = {}
    const questionMarkIndex = url.indexOf('?')
    if (questionMarkIndex !== -1) {
      query = queryString.parse(url.substring(questionMarkIndex + 1))
      url = url.substring(0, questionMarkIndex)
    }
    return { url, query }
  }
}

module.exports = patch
