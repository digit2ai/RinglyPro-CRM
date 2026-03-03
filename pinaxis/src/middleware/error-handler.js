'use strict';

module.exports = (err, req, res, next) => {
  console.error('PINAXIS Error:', err);

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.errors.map(e => ({ field: e.path, message: e.message }))
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      error: 'Duplicate Entry',
      details: err.errors.map(e => ({ field: e.path, message: e.message }))
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
