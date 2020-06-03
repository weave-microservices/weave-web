module.exports = {
  name: 'auth',
  actions: {
    login: {
      params: {
        username: { type: 'string' },
        password: { type: 'string' }
      },
      handler: (context) => {
        return context.params.username + '/' + context.params.password
      }
    }
  }
}
