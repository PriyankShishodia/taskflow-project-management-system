const { AppError } = require('../utils/errors');

module.exports = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: `${i.path.join('.')}: ${i.message}` }));
    throw new AppError(400, 'Validation failed', details);
  }
  req[source] = result.data;
  next();
};
