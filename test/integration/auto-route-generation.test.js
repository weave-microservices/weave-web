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
        generateAutoRoutes: true
      }],
      actions: {
        main: {
          rest: {
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
        generateAutoRoutes: true,
        whitelist: [
          'api2.yes'
        ]
      }],
      actions: {
        yes: {
          rest: {
            method: 'GET',
            path: 'yes'
          },
          handler (context) {
            return 'some value';
          }
        },
        no: {
          rest: {
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
