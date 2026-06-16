'use strict';

/**
 * Shared JWT secret resolver for Torna Idioma (v1 + v2).
 *
 * Fails fast in production if JWT_SECRET is unset, so tokens can no longer be
 * forged with the old publicly-known fallback string ('ringlypro-jwt-secret').
 * In non-production environments a dev-only fallback is used with a loud warning
 * so local development keeps working.
 */

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production — refusing to start Torna Idioma with a default secret'
    );
  }
  console.warn(
    '[torna_idioma] JWT_SECRET not set — using insecure dev-only fallback. Set JWT_SECRET before deploying.'
  );
}

module.exports = SECRET || 'torna-idioma-dev-only-insecure';
