const { Weave } = require('@weave-js/core');
const { WebService } = require('../../lib');
const path = require('path');
const { deepMerge } = require('@weave-js/utils');

module.exports = (settings, nodeSettings = {}, schemaExtensions = {}) => {
  const broker = Weave(deepMerge({
    logger: {
      enabled: false,
      logLevel: 'fatal'
    }
  }, nodeSettings));

  broker.loadService(path.join(__dirname, '..', 'services', 'greeter.service.js'));
  broker.loadService(path.join(__dirname, '..', 'services', 'math.service.js'));
  broker.loadService(path.join(__dirname, '..', 'services', 'test.service.js'));

  const service = broker.createService({
    mixins: [WebService()],
    settings,
    ...schemaExtensions
  });

  const server = service.server;

  return [broker, server, service];
};
