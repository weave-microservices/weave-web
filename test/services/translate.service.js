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
        return context.data.text.split('').reverse().join('')
      }
    }
  }
}
