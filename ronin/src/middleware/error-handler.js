'use strict';

module.exports = (err, req, res, next) => {
  console.error('Ronin Brotherhood Error:', err.message);
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack?.split('\n').slice(0, 3) })
  });
};
