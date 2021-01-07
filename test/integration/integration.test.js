const { Weave } = require('@weave-js/core')
const { WebService } = require('../../lib')
const request = require('supertest')
const path = require('path')
const fs = require('fs')
const { deepMerge } = require('@weave-js/utils')

const setup = (settings, nodeSettings = {}, schemaExtensions = {}) => {
  const broker = Weave(deepMerge({
    logger: {
      logLevel: 'fatal'
    }
  }, nodeSettings))

  broker.loadService(path.join(__dirname, '..', 'services', 'test.service.js'))

  const service = broker.createService({
    mixins: [WebService()],
    settings,
    ...schemaExtensions
  })

  const server = service.server

  return [broker, server, service]
}

describe('Test static file server', () => {
  let broker
  let server

  beforeAll(() => {
    [broker, server] = setup({
      port: 4155,
      assets: {
        folder: path.join(__dirname, '..', 'assets')
      },
      handlers: null
    })

    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
      .then(() => {
        broker = null
        server = null
      })
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
  let server

  beforeAll(() => {
    [broker, server] = setup({
      port: 4846,
      assets: {
        folder: path.join(__dirname, '..', 'assets')
      },
      handlers: [
        {
          path: '/api',
          whitelist: ['math.*', 'auth.*', 'test.*']
        },
        {
          path: '/api_new',
          whitelist: ['translate.*']
        }
      ]
    }, {
      nodeId: 'web-service-test'
    })

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))
    broker.loadService(path.join(__dirname, '..', 'services', 'translate.service.js'))

    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
      .then(() => {
        broker = null
        server = null
      })
  })

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

  it('GET test.hello with sanitized url', () => {
    return request(server)
      .get('/api/test/file')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/octet-stream')
        expect(res.body.toString()).toBe('Hello from weave')
      })
  })
  it('GET response headers from action', () => {
    return request(server)
      .get('/api/test/responseHeader')
      .then(res => {
        expect(res.headers['content-type']).toBe('application/pdf')
        expect(res.headers['custom-header-field']).toBe('i-am-custom')
      })
  })

  it('GET should return Buffer', () => {
    return request(server)
      .get('/api/test/buffer')
      .then(res => {
        expect(res.headers['content-type']).toBe('application/octet-stream')
        expect(res.headers['content-length']).toBe('19')
        expect(res.body).toEqual(Buffer.from('Lorem ipsum bla bla'))
      })
  })

  it('GET should return serialized Buffer', () => {
    return request(server)
      .get('/api/test/serializedBuffer')
      .then(res => {
        expect(res.headers['content-type']).toBe('application/octet-stream')
        expect(res.headers['content-length']).toBe('19')
        expect(res.body).toEqual(Buffer.from('Lorem ipsum bla bla'))
      })
  })

  it('GET should return custom content type', () => {
    return request(server)
      .get('/api/test/responseType')
      .then(res => {
        expect(res.headers['content-type']).toBe('custom/pdf')
      })
  })
  it('GET should return custom content type', () => {
    return request(server)
      .get('/api/test/responseTypeInt')
      .then(res => {
        expect(res.headers['content-type']).toBe('custom/pdf')
      })
  })

  it('GET should handle custom status code from action', () => {
    return request(server)
      .get('/api/test/statusCode')
      .then(res => {
        expect(res.status).toBe(304)
      })
  })
})

describe('Request hooks', () => {
  let flow
  let broker
  let server

  beforeAll(() => {
    flow = [];
    [broker, server] = setup({
      port: 4956,
      handlers: [
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
      .then(() => {
        broker = null
        server = null
      })
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

describe('Handling handler routes', () => {
  let broker
  let server

  beforeAll(() => {
    // flow = [];
    [broker, server] = setup({
      port: 4256,
      handlers: [
        {
          path: '/api',
          whitelist: ['test.*', 'math.*'],
          routes: {
            'GET /json': 'test.json',
            'GET /json/:name': 'test.jsonWithParams',
            'GET /json-middleware': [
              function (request, response, next) {
                request.$params.name = 'Johnny'
                return next()
              },
              'test.jsonWithParams'
            ]
          }
        }
      ]
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

  it('should handle route middlewares with an array definition', () => {
    return request(server)
      .get('/api/json-middleware')
      .then(res => {
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.body).toEqual({
          name: 'Johnny',
          age: 12,
          gender: 'male'
        })
      })
  })
})

describe('Authorization', () => {
  let broker
  let server

  beforeAll(() => {
    [broker, server] = setup({
      port: 4506,
      handlers: [
        {
          path: '/api',
          routes: {
            'GET /json-authorized': 'test.json',
            'GET /json-authorized-fail': 'test.json'
          },
          authorization: true
        }
      ]
    },
    {},
    {
      methods: {
        authorize (context, request, response) {
          if (request.parsedUrl !== '/api/json-authorized') {
            const error = new Error('Failed')
            error.code = 405
            return Promise.reject(error)
          }
        }
      }})

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'))
    return broker.start()
  })

  afterAll(() => {
    return broker.stop()
  })

  it('should call an action through an route alias', () => {
    return request(server)
      .get('/api/json-authorized')
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

  it('should fail with an authorization error', () => {
    return request(server)
      .get('/api/json-authorized-fail')
      .then(res => {
        expect(res.statusCode).toBe(405)
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;')
        expect(res.body).toEqual({
          code: 405,
          message: 'Failed',
          name: 'Error'
        })
      })
  })
})
