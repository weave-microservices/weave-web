module.exports = {
  name: 'math',
  actions: {
    test: {
      params: {
        p1: { type: 'number', convert: true },
        p2: { type: 'number', convert: true }
      },
      handler: (context) => {
        return Number(context.params.p1) + Number(context.params.p2)
      }
    }
  }
}
