/**
 * Escapes a regex string
 * @param {string} string String to escape
 * @returns {string} Escaped string
*/

exports.escapeRegex = (string) => {
  return String(string).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
};
