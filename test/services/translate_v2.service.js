module.exports = {
  name: 'translate',
  settings: {
    http: {
      basePath: '/translate'
    }
  },
  version: 2,
  actions: {
    language () {
      return 'deutsch';
    },
    reverse: {
      params: {
        text: { type: 'string' }
      },
      http: {
        method: 'GET',
        path: '/reverse/:text'
      },
      handler: (context) => {
        return context.data.text.split('').reverse().join('') + '-v2';
      }
    }
  }
};
