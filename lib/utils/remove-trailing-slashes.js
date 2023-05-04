module.exports.removeTrailingSlashes = path => {
  if (path.startsWith('/')) {
    path = path.slice(1);
  }

  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path;
};
