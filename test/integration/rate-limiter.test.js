const { Weave } = require('@weave-js/core')
const { WebService } = require('../../lib')
const request = require('supertest')
const path = require('path')
const fs = require('fs')
const { deepMerge } = require('@weave-js/utils')
const lolex = require('lolex')

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

describe('Test rate limitter', () => {
  let broker
  let server
  let clock

  beforeAll(() => {
    clock = lolex.install();

    [broker, server] = setup({
      port: 8157,
      rateLimit: {
        windowSizeMs: 5000,
        limit: 3,
        headers: true
      },
      handlers: [
        {
          path: '/api',
          whitelist: ['math.*', 'auth.*']
        }
      ]
    })

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))
    return broker.start()
  })

  afterAll(() => {
    clock.uninstall()
    return broker.stop()
      .then(() => {
        broker = null
        server = null
      })
  })

  it('GET /math (1)', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remaining']).toBe('2')
        expect(res.text).toBe('2')
      })
  })

  it('GET /math (2)', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remaining']).toBe('1')
        expect(res.text).toBe('2')
      })
  })

  it('GET /math (3)', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remaining']).toBe('0')
        expect(res.text).toBe('2')
      })
  })

  it('GET /math (4)', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(429)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remaining']).toBe('0')
        expect(JSON.parse(res.text)).toMatchObject({
          name: 'RateLimitExceededError',
          code: 429,
          message: 'Too many requests.'
        })
      })
  })

  it('should reset rate limiter after x seconds', () => {
    clock.tick(6000)
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remaining']).toBe('2')
        expect(res.text).toBe('2')
      })
  })
})
