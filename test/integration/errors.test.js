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
      errorHeader (_, response) {
        response.setHeader('Content-type', 'text/html; charset=UTF-8');
      },
      errorFormatter (statusCode, error, response) {
        return 'You are not authorized';
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
      .set('Accept', 'text/html')

      // .catch(err => {
      //   expect(res.statusCode).toBe(404);
      // })
      .then(res => {
        expect(res.statusCode).toBe(422);
        expect(res.headers['content-type']).toBe('text/html; charset=UTF-8');
        expect(res.text).toBe('You are not authorized');
      });
  });
});
