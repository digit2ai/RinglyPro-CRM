'use strict';

/**
 * 404 Not Found Middleware
 */

module.exports = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
};
