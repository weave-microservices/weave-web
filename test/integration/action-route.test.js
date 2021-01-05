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

describe.only('Test action side route definition', () => {
  let broker
  let server

  beforeAll(() => {
    [broker, server] = setup({
      port: 8156,
      generateRoutesFromActions: false,
      assets: {
        folder: path.join(__dirname, '..', 'assets')
      },
  
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
