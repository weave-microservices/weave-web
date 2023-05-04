const request = require('supertest');
const setup = require('../utils/setupNode');
const { MAPPING_POLICY_ALL } = require('../../lib/constants');

describe('Test errors', () => {
  let broker;
  let server;

  beforeAll(() => {
    [broker, server] = setup({
      port: 9147,
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          whitelist: ['math.*', 'auth.*']
        }
      ],
      errorFormatter (statusCode, error) {
        return 'Something went wrong.';
      }
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

  it('should return a custom formatted error', () => {
    return request(server)
      .get('/api/math/test')
      .then(res => {
        expect(res.statusCode).toBe(404);
        expect(res.headers['content-type']).toBe('application/json; charset=UTF-8');
        expect(res.text).toBe('6');
      });
  });
});
