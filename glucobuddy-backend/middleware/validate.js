const { ZodError } = require('zod');

const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Body validation
      if (schema.body) {
        req.validatedBody = schema.body.parse(req.body);
      }

      // Query validation
      if (schema.query) {
        req.validatedQuery = schema.query.parse(req.query);
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const error = new Error(
          err.issues[0]?.message || 'Validation failed'
        );
        error.status = 400;
        return next(error);
      }

      next(err);
    }
  };
};

module.exports = validate; 