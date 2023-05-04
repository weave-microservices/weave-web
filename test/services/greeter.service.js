module.exports = {
  name: 'greeter',
  settings: {
    rest: '/greeter-api'
  },
  actions: {
    hello: {
      rest: 'GET /hello/:name',
      params: {
        name: { type: 'string' }
      },
      handler: (context) => {
        return `Hello ${context.data.name}!`;
      }
    }
  }
};
