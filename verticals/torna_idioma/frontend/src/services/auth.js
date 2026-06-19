// Interface language is en|fil only (Spanish is the subject taught, not a UI lang).
function coerceLang(l) {
  return l === 'fil' ? 'fil' : (l === 'en' ? 'en' : null);
}

export function login(token, user) {
  sessionStorage.setItem('ti_token', token);
  sessionStorage.setItem('ti_user', JSON.stringify(user));
  // Seed the active UI language from the account preference (legacy 'es' → 'en').
  // The toggle can still override this per-device afterwards.
  const seed = coerceLang(user && user.language_pref) || 'fil';
  localStorage.setItem('ti_lang', seed);
}

export function logout() {
  sessionStorage.removeItem('ti_token');
  sessionStorage.removeItem('ti_user');
}

export function isAuthenticated() {
  return !!sessionStorage.getItem('ti_token');
}

export function getUser() {
  const u = sessionStorage.getItem('ti_user');
  return u ? JSON.parse(u) : null;
}

export function hasRole(...roles) {
  const user = getUser();
  return user && roles.includes(user.role);
}

export function getLang() {
  // The explicit toggle wins (so EN/FIL actually switches for logged-in users),
  // then the account preference, then default to Filipino (Tagalog) — the primary
  // audience. Only en|fil are valid UI languages.
  return coerceLang(localStorage.getItem('ti_lang'))
      || coerceLang(getUser()?.language_pref)
      || 'fil';
}

export function setLang(lang) {
  localStorage.setItem('ti_lang', coerceLang(lang) || 'fil');
}
