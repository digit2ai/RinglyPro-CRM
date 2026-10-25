'use strict';

/**
 * requireOwnClient — a signed-in CRM user may act only on their OWN client.
 *
 * Several routes took the client id from the URL or the body and trusted it,
 * so anyone could read another client's lead list or CRM keys by changing a
 * number. This checks the CRM login token (the same one the dashboard keeps in
 * localStorage 'token') and compares the requested client with the user's own.
 * A CRM admin (users.is_admin) may act on any client.
 *
 * Wrong client answers 404, not 403: a 403 confirms the client exists.
 *
 *   router.get('/x/:clientId', requireOwnClient(req => req.params.clientId), handler)
 */

const jwt = require('jsonwebtoken');

function secret() {
  return process.env.JWT_SECRET || 'your-super-secret-jwt-key';   // same fallback as middleware/auth.js
}

function requireOwnClient(pick) {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (!token) return res.status(401).json({ success: false, error: 'Sign in required' });

      let decoded;
      try { decoded = jwt.verify(token, secret()); }
      catch (e) { return res.status(401).json({ success: false, error: 'Session expired, sign in again' }); }

      const { User } = require('../models');
      const user = await User.findByPk(decoded.userId);
      if (!user) return res.status(401).json({ success: false, error: 'Sign in required' });

      const wanted = parseInt(pick(req), 10);
      if (!Number.isInteger(wanted)) return res.status(400).json({ success: false, error: 'Client ID is required' });

      let own = parseInt(decoded.clientId, 10);
      if (!Number.isInteger(own)) {
        const CreditSystem = require('../services/creditSystem');
        const c = await new CreditSystem().getClientByUserId(user.id).catch(() => null);
        own = c ? c.id : NaN;
      }

      const isAdmin = !!(user.isAdmin || user.is_admin);
      if (!isAdmin && own !== wanted) return res.status(404).json({ success: false, error: 'Not found' });

      req.user = { userId: user.id, email: user.email, clientId: own, isAdmin };
      next();
    } catch (e) {
      console.error('requireOwnClient:', e.message);
      return res.status(500).json({ success: false, error: 'Authentication failed' });
    }
  };
}

module.exports = { requireOwnClient };
