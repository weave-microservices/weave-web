module.exports = {
  name: 'translate',
  actions: {
    language () {
      return 'deutsch'
    },
    reverse: {
      params: {
        text: { type: 'string' }
      },
      handler: (context) => {
        return context.params.text.split('').reverse().join('')
      }
    }
  }
}
