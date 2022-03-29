const request = require('supertest');
const { MAPPING_POLICY_ALL } = require('../../lib/constants');
const setup = require('../utils/setupNode');

describe('Test middlewares', () => {
  let broker;
  let server;

  const beforeRequestHandler = jest.fn();
  const afterRequestHandler = jest.fn((context, handler, request, response, data) => data);
  const requestFailedHandler = jest.fn((request, response, error) => {
    response.writeHead(500);
    response.end('Internal Server Error');
  });

  beforeAll(() => {
    [broker, server] = setup({
      port: 3127,
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          beforeRequest: beforeRequestHandler,
          afterRequest: afterRequestHandler,
          requestFailed: requestFailedHandler,
          whitelist: ['math.*', 'test.*']
        }
      ]
    });

    return broker.start();
  });

  afterAll(() => {
    return broker.stop()
      .then(() => {
        broker = null;
        server = null;
      });
  });

  it('should call before and after hook on success.', () => {
    return request(server)
      .get('/api/math/test?p1=1&p2=1')
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8;');
        expect(beforeRequestHandler).toBeCalled();
        expect(afterRequestHandler).toBeCalled();
        expect(res.text).toBe('2');
      });
  });

  it('should call before and fail hook', () => {
    return request(server)
      .get('/api/test/error')
      .then(res => {
        expect(requestFailedHandler).toBeCalled();
      });
  });
});
