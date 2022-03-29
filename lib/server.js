const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');
const patchRequest = require('./request');
const patchResponse = require('./response');

function createServer (options, httpHandler) {
  let server;

  if (options.serverFactory) {

  } else if (options.https) {
    if (options.http2) {
      server = http2().createServer(options.https, httpHandler);
    } else {
      server = https.createServer(options.https, httpHandler);
    }
  } else if (options.http2) {
    server = http2().createServer(httpHandler);
  } else {
    server = http.createServer(httpHandler);
  }

  return { server, listen };

  function listen () {
    return server.listen();
  }

  function http2 () {
    try {
      return require('http2');
    } catch (error) {
      throw new Error('HTTP2 is available only from node >= 8.8.1');
    }
  }
}

module.exports = (options) => {
  const bus = new EventEmitter();
  let server;

  if (options.http2) {
    try {
      const http2 = require('http2');
      server = http2.createServer(options.http2);

      patchRequest(http2.IncomingMessage);
      patchResponse(http2.OutgoingMessage);
    } catch (error) {}
  } else {
    if (options.http) {
      server = http.createServer(options.http);
    } else {
      server = http.createServer();
    }
    patchRequest(http.IncomingMessage);
    patchResponse(http.OutgoingMessage);
  }

  const setupRequest = (request, response) => {};

  const onRequest = (request, response) => {
    bus.emit('request', request);
    setupRequest(request, response);
  };

  server.on('request', onRequest);

  return {
    bus,
    server,
    listen () {
      const args = Array.from(arguments);
      return server.listen.apply(server, args);
    }
  };
};

module.exports = { createServer };
