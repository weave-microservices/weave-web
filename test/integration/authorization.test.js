const { Weave } = require('@weave-js/core')
const { WebService } = require('../../lib')
const request = require('supertest')
const path = require('path')
const { deepMerge } = require('@weave-js/utils')

const setup = (settings, nodeSettings = {}, schemaExtensions = {}) => {
  const broker = Weave(deepMerge({
    logger: {
      enabled: false,
      logLevel: 'fatal'
    }
  }, nodeSettings))

  broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'))

  const service = broker.createService({
    mixins: [WebService()],
    settings,
    ...schemaExtensions
  })

  const server = service.server

  return [broker, server, service]
}

describe('Test authorization', () => {
  let broker
  let server
  const methods = {
    authorize: jest.fn(() => {
      return true
    })
  }

  beforeAll(() => {
    [broker, server] = setup({
      port: 8159,
      rateLimit: {
        windowSizeMs: 5000,
        limit: 3,
        headers: true
      },
      handlers: [
        {
          path: '/api',
          whitelist: ['math.*', 'auth.*'],
          authorization: true
        }
      ]
    }, {}, {
      methods
    })

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))
    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
      .then(() => {
        broker = null
        server = null
      })
  })

  it('GET /math (1)', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=4')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remaining']).toBe('2')
        expect(res.text).toBe('5')
        expect(methods.authorize).toBeCalled()
      })
  })
})
