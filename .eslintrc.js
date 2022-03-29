module.exports = {
  root: true,
  extends: [
    'eslint-config-fw'
  ],
  parserOptions: {
    'sourceType': 'module',
    'ecmaVersion': 9
  },
  rules: {
    'quotes': [2, 'single', { 'avoidEscape': true }],
    'indent': ['error', 2],
    'semi': [2, 'always'],
    'no-var': ['error']
  }
};
