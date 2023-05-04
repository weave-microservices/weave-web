const request = require('supertest');
const path = require('path');
const setup = require('../utils/setupNode');
const { MAPPING_POLICY_ALL } = require('../../lib/constants');

describe('Test CORS handling', () => {
  let broker;
  let server;

  it('Should pass without any errors.', () => {
    [broker, server] = setup({
      port: 5147,
      cors: {},
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          whitelist: ['greeter.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
    return broker.start()
      .then(() => request(server)
        .get('/api/greeter/hello?name=Kevin'))
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('Hello Kevin!');
      })
      .then(() => broker.stop())
      .catch((error) => broker.stop()
        .then(() => {
          throw error;
        })
      );
  });

  it('should throw an error on mismatching origin.', () => {
    [broker, server] = setup({
      port: 5147,
      cors: {
        origin: 'abc'
      },
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          whitelist: ['greeter.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
    return broker.start()
      .then(() => request(server)
        .get('/api/greeter/hello?name=Kevin')
        .set('Origin', 'http://localhost:5147')
      )
      .then(res => {
        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
          statusCode: 403,
          code: 'HTTP_ORIGIN_NOT_ALLOWED',
          message: 'Forbidden.',
          name: 'ForbiddenError'
        });
      })
      .then(() => broker.stop())
      .catch((error) => broker.stop()
        .then(() => {
          throw error;
        })
      );
  });

  it('should return default header.', () => {
    [broker, server] = setup({
      port: 5147,
      cors: {},
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          whitelist: ['greeter.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
    return broker.start()
      .then(() => request(server)
        .get('/api/greeter/hello?name=Kevin')
        .set('Origin', 'http://localhost:5147')
      )
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('Hello Kevin!');
        expect(res.header['access-control-allow-methods']).toBe('GET, HEAD, PUT, PATCH, POST, DELETE');
        expect(res.header['access-control-allow-origin']).toBe('*');
      })
      .then(() => broker.stop())
      .catch((error) => broker.stop()
        .then(() => {
          throw error;
        })
      );
  });

  it('should return default header.', () => {
    [broker, server] = setup({
      port: 5147,
      cors: {},
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          whitelist: ['greeter.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
    return broker.start()
      .then(() => request(server)
        .get('/api/greeter/hello?name=Kevin')
        .set('Origin', 'http://localhost:5147')
      )
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('Hello Kevin!');
        expect(res.header['access-control-allow-methods']).toBe('GET, HEAD, PUT, PATCH, POST, DELETE');
        expect(res.header['access-control-allow-origin']).toBe('*');
      })
      .then(() => broker.stop())
      .catch((error) => broker.stop()
        .then(() => {
          throw error;
        })
      );
  });

  it('should pass if origin matched (wildcard).', () => {
    [broker, server] = setup({
      port: 5147,
      cors: {
        methods: ['GET', 'POST']
      },
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          cors: {
            methods: ['GET', 'POST'],
            origin: ['http://*.a.com', 'http://*.localhost:5147']
          },
          whitelist: ['greeter.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
    return broker.start()
      .then(() => request(server)
        .get('/api/greeter/hello?name=Kevin')
        .set('Origin', 'http://test.localhost:5147')
      )
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('Hello Kevin!');
        expect(res.header['access-control-allow-methods']).toBe('GET, POST');
        expect(res.header['access-control-allow-origin']).toBe('http://test.localhost:5147');
      })
      .then(() => broker.stop())
      .catch((error) => broker.stop()
        .then(() => {
          throw error;
        })
      );
  });

  it('should pass if origin matched (wildcard).', () => {
    [broker, server] = setup({
      port: 5147,
      cors: {
        methods: ['GET', 'POST']
      },
      handlers: [
        {
          path: '/api',
          mappingPolicy: MAPPING_POLICY_ALL,
          cors: {
            methods: ['GET', 'POST'],
            origin: 'http://localhost:5147',
            credentials: true,
            maxAge: 60000
          },
          whitelist: ['greeter.*']
        }
      ]
    });

    broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
    return broker.start()
      .then(() => request(server)
        .get('/api/greeter/hello?name=Kevin')
        .set('Origin', 'http://localhost:5147')
      )
      .then(res => {
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('Hello Kevin!');
        expect(res.header['access-control-allow-methods']).toBe('GET, POST');
        expect(res.header['access-control-allow-origin']).toBe('http://localhost:5147');
        expect(res.header['access-control-allow-credentials']).toBe('true');
        expect(res.header['access-control-max-age']).toBe('60000');
      })
      .then(() => broker.stop())
      .catch((error) => broker.stop()
        .then(() => {
          throw error;
        })
      );
  });
});
