const { Weave } = require('@weave-js/core')
const ApiService = require('../../lib')
const request = require('supertest')
const path = require('path')
const fs = require('fs')
const { deepMerge } = require('@weave-js/utils')
const lolex = require('lolex')

const setup = (settings, nodeSettings = {}) => {
  const broker = Weave(deepMerge({ logLevel: 'fatal' }, nodeSettings))
  broker.loadService(path.join(__dirname, '..', 'services', 'test.service.js'))

  const service = broker.createService({
    mixins: [ApiService()],
    settings
  })

  const server = service.server

  return [broker, service, server]
}

describe('Test static file server', () => {
  let broker
  let service
  let server

  beforeAll(() => {
    [broker, service, server] = setup({
      port: 8156,
      assets: {
        folder: path.join(__dirname, '..', 'assets')
      },
      routes: null
    })

    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
  })

  it('Serve index.html', () => {
    return request(server)
      .get('/')
      .expect(200, 'Hello World')
      .then((res) => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('text/html; charset=UTF-8')
        expect(res.text).toBe(fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf-8'))
      })
  })

  it('Serve file', () => {
    return request(server)
      .get('/lorem-ipsum.txt')
      .then((res) => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('text/plain; charset=UTF-8')
        expect(res.text).toBe('Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.')
      })
  })

  it('GET correct content type for png', () => {
    return request(server)
      .get('/img/Logo.png')
      .then(res => {
        expect(res.headers['content-type']).toBe('image/png')
      })
  })
})

describe('Weave web service', () => {
  let broker
  let service
  let server

  beforeAll(() => {
    [broker, service, server] = setup({
      port: 8156,
      assets: {
        folder: path.join(__dirname, '..', 'assets')
      },
      routes: [
        {
          path: '/api',
          whitelist: ['math.*', 'auth.*']
        }
      ]
    })

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))
    return broker.start()
  })

  afterAll(() => broker.stop())

  it('Serve index.html', () => {
    return request(server)
      .get('/')
      .then((res) => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('text/html; charset=UTF-8')
        expect(res.text).toBe(fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf-8'))
      })
  })

  it('Serve index.html', () => {
    return request(server)
      .get('/test/file')
      .then((res) => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/octet-stream')
        expect(res.body).toEqual(Buffer.from('Hello from weave'))
      })
  })

  it('GET /math', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.text).toBe('2')
      })
  })

  it('GET test.hello with sanitized url', () => {
    return request(server)
      .get('/api/test/hello/')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.body).toBe('Hello from ' + res.headers['x-request-id'])
      })
  })
})

describe('Test rate limitter', () => {
  let broker
  let service
  let server
  let clock

  beforeAll(() => {
    clock = lolex.install();

    [broker, service, server] = setup({
      port: 8156,
      rateLimit: {
        windowSizeMs: 5000,
        limit: 3,
        headers: true
      },
      routes: [
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
  })

  it('GET /math', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remainung']).toBe('2')
        expect(res.text).toBe('2')
      })
  })

  it('GET /math', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remainung']).toBe('1')
        expect(res.text).toBe('2')
      })
  })

  it('GET /math', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remainung']).toBe('0')
        expect(res.text).toBe('2')
      })
  })

  it('GET /math', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(429)
        expect(res.headers['x-rate-limit-limit']).toBe('3')
        expect(res.headers['x-rate-limit-window']).toBe('5000')
        expect(res.headers['x-rate-limit-remainung']).toBe('0')
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
        expect(res.headers['x-rate-limit-remainung']).toBe('2')
        expect(res.text).toBe('2')
      })
  })
})

describe('Request hooks', () => {
  let flow
  let broker
  let service
  let server

  beforeAll(() => {
    flow = [];
    [broker, service, server] = setup({
      port: 8156,
      routes: [
        {
          path: '/api',
          whitelist: ['test.*', 'math.*'],
          beforeRequest () {
            flow.push('before')
          },
          afterRequest () {
            flow.push('after')
          },
          requestFailed (request, response, error) {
            response.writeHead(500)
            response.end(error.message)
          }
        }
      ]
    })

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))

    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
  })

  it('GET /math should call route hooks in the ride order', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(flow.join('-')).toBe('before-after')
      })
  })

  it('GET /math should call route hooks in the ride order', () => {
    return request(server)
      .get('/api/test/error')
      .then(res => {
        expect(res.statusCode).toBe(500)
        expect(res.text).toBe('Error!!!')
      })
  })
})

describe('Route aliases', () => {
  let flow
  let broker
  let service
  let server

  beforeAll(() => {
    flow = [];
    [broker, service, server] = setup({
      port: 8156,
      routes: [
        {
          path: '/api',
          whitelist: ['test.*', 'math.*'],
          aliases: {
            'GET /json': 'test.json',
            'GET /json/:name': 'test.jsonWithParams'
          }
        }
      ]
    })

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))
    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
  })

  it('should call an action through an route alias', () => {
    return request(server)
      .get('/api/json')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.body).toEqual({
          name: 'Bill',
          age: 12,
          gender: 'male'
        })
      })
  })

  it('GET /math should call route hooks in the ride order', () => {
    return request(server)
      .get('/api/json/Donald')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.body).toEqual({
          name: 'Donald',
          age: 12,
          gender: 'male'
        })
      })
  })
})
