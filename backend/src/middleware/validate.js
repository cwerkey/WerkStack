'use strict';

// validate — Zod schema middleware.
// On failure returns { error: 'validation failed', issues: [...] }
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'validation failed',
        issues: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
