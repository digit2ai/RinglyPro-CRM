const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ringlypro-jwt-secret';
const TENANT_ID = 'torna_idioma';

function authMiddleware(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.tenant_id !== TENANT_ID) {
        return res.status(403).json({ error: 'Invalid tenant access' });
      }
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Convenience exports for Torna Idioma roles
authMiddleware.any = authMiddleware([]);
authMiddleware.admin = authMiddleware(['admin']);
authMiddleware.official = authMiddleware(['admin', 'official']);
authMiddleware.teacher = authMiddleware(['admin', 'official', 'teacher']);
authMiddleware.student = authMiddleware(['admin', 'teacher', 'student']);
authMiddleware.bpo = authMiddleware(['admin', 'official', 'bpo_worker']);
authMiddleware.partner = authMiddleware(['admin', 'official', 'partner']);

module.exports = authMiddleware;
