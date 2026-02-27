/**
 * Web Call Center - Authentication Middleware
 * Re-exports auth middleware from the main CRM
 */

const { authenticateToken, getUserClient, authenticateAndGetClient } = require('../../../src/middleware/auth');

module.exports = {
  authenticateToken,
  getUserClient,
  authenticateAndGetClient
};
