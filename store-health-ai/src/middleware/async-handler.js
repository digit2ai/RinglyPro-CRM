'use strict';

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors automatically
 */

module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
