// Interface language is en|fil only (Spanish is the subject taught, not a UI lang).
function coerceLang(l) {
  return l === 'fil' ? 'fil' : (l === 'en' ? 'en' : null);
}

export function login(token, user) {
  sessionStorage.setItem('ti_token', token);
  sessionStorage.setItem('ti_user', JSON.stringify(user));
  // Seed the UI language from the account preference ONLY when this device has
  // not already chosen one. A visitor who picked Filipino on the landing page
  // must still be in Filipino after signing in — clobbering that here was why
  // the dashboard reverted to the account default on every login.
  if (!coerceLang(localStorage.getItem('ti_lang'))) {
    localStorage.setItem('ti_lang', coerceLang(user && user.language_pref) || 'fil');
  }
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
