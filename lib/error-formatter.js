const formatError = (statusCode, error, service) => {
  if (service.settings.errorFormatter) {
    return service.settings.errorFormatter.call(service, statusCode, error);
  }

  return JSON.stringify(
    {
      name: error.name,
      code: error.code,
      statusCode,
      message: error.message,
      data: error.data
    },
    null,
    4
  );
};

module.exports = {
  formatError
};
