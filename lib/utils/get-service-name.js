module.exports.getFullService = (service) => {
  if (service.version != null && service.settings.$noVersionPrefix !== true) {
    return (typeof (service.version) === 'number' ? 'v' + service.version : service.version) + '.' + service.name;
  }
  return service.name;
};
