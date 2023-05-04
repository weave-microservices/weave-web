const request = require('supertest');
const path = require('path');
const setup = require('../utils/setupNode');
const { MAPPING_POLICY_ALL } = require('../../lib/constants');

describe('Test middlewares', () => {
  let broker;
  let server;

  const middleware = jest.fn((request, response, next) => {
    request.query.p2 = parseInt(request.query.p2) + 2;
    return next();
  });

  beforeAll(() => {
    [broker, server] = setup({
      port: 5147,
      use: [middleware],
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          use: [middleware],
          whitelist: ['math.*', 'auth.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'));
    return broker.start();
  });

  afterAll(() => {
    return broker.stop()
      .then(() => {
        broker = null;
        server = null;
      });
  });

  it('Middleware should modify the incomming query params', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8');
        expect(res.text).toBe('6');
      });
  });
});
