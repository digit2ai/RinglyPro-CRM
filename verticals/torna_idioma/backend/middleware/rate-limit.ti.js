'use strict';

/**
 * Lightweight in-memory per-user rate limiter for cost-sensitive endpoints
 * (tutor /chat, /tts). Sliding window; keyed by authenticated user id (falls
 * back to IP). Additive + security-safe — never weakens auth, just throttles.
 *
 * Single-process friendly (Render web service). For multi-instance, swap the
 * Map for a shared store later; the contract is unchanged.
 */

function rateLimit({ windowMs = 60000, max = 20, key = 'default' } = {}) {
  const hits = new Map(); // id -> [timestamps]
  return (req, res, next) => {
    const id = `${key}:${req.user?.id || req.ip || 'anon'}`;
    const now = Date.now();
    const arr = (hits.get(id) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: 'rate_limited', retry_after_s: retry });
    }
    arr.push(now);
    hits.set(id, arr);
    // Opportunistic cleanup to bound memory.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every(t => now - t >= windowMs)) hits.delete(k);
      }
    }
    next();
  };
}

module.exports = rateLimit;
