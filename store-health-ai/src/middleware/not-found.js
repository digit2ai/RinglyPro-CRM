'use strict';

/**
 * 404 Not Found Middleware
 */

module.exports = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      statusCode: 404,
      requestId: req.id
    }
  });
};
