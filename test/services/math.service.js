module.exports = {
  name: 'math',
  actions: {
    test: {
      params: {
        p1: { type: 'number', convert: true },
        p2: { type: 'number', convert: true }
      },
      handler: (context) => {
        return Number(context.data.p1) + Number(context.data.p2);
      }
    },
    add: {
      params: {
        p1: { type: 'number', convert: true },
        p2: { type: 'number', convert: true }
      },
      handler: (context) => {
        return Number(context.data.p1) + Number(context.data.p2);
      }
    }
  }
};
