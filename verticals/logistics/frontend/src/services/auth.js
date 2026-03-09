export function login(token, user) { sessionStorage.setItem('lg_token', token); sessionStorage.setItem('lg_user', JSON.stringify(user)); }
export function logout() { sessionStorage.removeItem('lg_token'); sessionStorage.removeItem('lg_user'); }
export function isAuthenticated() { return !!sessionStorage.getItem('lg_token'); }
export function getUser() { try { return JSON.parse(sessionStorage.getItem('lg_user')); } catch { return null; } }
export function hasRole(...roles) { const u = getUser(); return u && roles.includes(u.role); }
