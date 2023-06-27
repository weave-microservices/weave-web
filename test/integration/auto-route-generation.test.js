const { createBroker } = require('@weave-js/core');
const { WebService } = require('../../lib');
const request = require('supertest');

describe('Auto generate routes from actions', () => {
  it('should generate routes from actions (local)', async () => {
    const n1 = createBroker({
      nodeId: 'node-1'
    });

    const service = n1.createService({
      name: 'api2',
      mixins: [WebService()],
      settings: {
        port: 2199,
        generateRoutesFromActions: true
      },
      handlers: [{
        path: '/',
        generateRoutes: true
      }],
      actions: {
        main: {
          http: {
            method: 'get',
            path: 'main'
          },
          handler (context) {
            return 'some value';
          }
        }
      }
    });

    await n1.start();

    const route = service.routes[0];

    expect(service.routes.length).toBe(1);
    expect(route.actionName).toBe('api2.main');
    expect(route.fullPath).toBe('/api2/main');
    expect(route.method).toBe('get');
    expect(route.path).toBe('api2/main');
    await n1.stop();
  });

  it('should generate routes from actions with whitelist (falsy)', async () => {
    const n1 = createBroker({
      nodeId: 'node-1'
    });

    const service = n1.createService({
      name: 'api2',
      mixins: [WebService()],
      settings: {
        port: 2299,
        generateRoutesFromActions: true
      },
      handlers: [{
        path: '/',
        generateRoutes: true,
        whitelist: [
          'api2.yes'
        ]
      }],
      actions: {
        yes: {
          http: {
            method: 'GET',
            path: 'yes'
          },
          handler (context) {
            return 'some value';
          }
        },
        no: {
          http: {
            method: 'GET',
            path: 'no'
          },
          handler (context) {
            return 'some root value';
          }
        }
      }
    });

    await n1.start();

    let result = await request(service.server)
      .get('/api2/yes');

    expect(result.statusCode).toBe(200);

    result = await request(service.server)
      .get('/api2/no');

    expect(result.statusCode).toBe(404);

    await n1.stop();
  });
});

describe('Auto generate routes from versioned actions', () => {
  it('should generate routes from actions with versions', async () => {
    const n1 = createBroker({
      nodeId: 'node-1'
    });

    const service = n1.createService({
      name: 'api3',
      mixins: [WebService()],
      settings: {
        port: 2599,
        generateRoutesFromActions: true,
        logRouteRegistration: true,
        logRouteRegistrationLevel: 'info'
      },
      handlers: [{
        path: '/',
        generateRoutes: true,
        whitelist: [
          'translate.reverse'
        ]
      }, {
        path: '/v2',
        generateRoutes: true,
        whitelist: [
          'v2.translate.reverse'
        ]
      }]
    });

    n1.createService(require('../services/translate.service'));
    n1.createService(require('../services/translate_v2.service'));

    await n1.start();

    const resultDefault = await request(service.server)
      .get('/translate/reverse/hello');

    expect(resultDefault.statusCode).toBe(200);
    expect(resultDefault.body).toBe('olleh');

    const resultV2 = await request(service.server)
      .get('/v2/translate/reverse/hello');

    expect(resultV2.statusCode).toBe(200);
    expect(resultV2.body).toBe('olleh-v2');

    await n1.stop();
  });
});
