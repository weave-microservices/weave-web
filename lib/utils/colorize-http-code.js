const kleur = require('kleur')

module.exports.colorizeHttpCode = code => {
  if (code >= 500) {
    return kleur.red().bold(code)
  }
  if (code >= 400 && code < 500) {
    return kleur.red().bold(code)
  }
  if (code >= 300 && code < 400) {
    return kleur.cyan().bold(code)
  }
  if (code >= 200 && code < 300) {
    return kleur.green().bold(code)
  }

  return code
}
