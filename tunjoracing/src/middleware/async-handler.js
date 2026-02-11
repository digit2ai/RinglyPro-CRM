'use strict';

/**
 * Async Handler - Wraps async route handlers to catch errors
 */

module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
