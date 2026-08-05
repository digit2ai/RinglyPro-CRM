// Two different questions, deliberately kept apart:
//
//   storedLang() — what the visitor actually picked. The public marketing surfaces
//                  (landing, login) speak en|es|fil, so 'es' is a real choice here.
//   getLang()    — which dictionary the APP INTERIOR renders in. That stays en|fil:
//                  Spanish is the subject being taught and there is no Spanish app
//                  dictionary, so 'es' resolves to English rather than to missing keys.
//
// The distinction matters because the old code answered both with one function and
// treated 'es' as garbage — so signing in DELETED a visitor's Spanish choice.
const PUBLIC_LANGS = ['en', 'es', 'fil'];

function storedLang() {
  const l = localStorage.getItem('ti_lang');
  return PUBLIC_LANGS.indexOf(l) !== -1 ? l : null;
}

// A public choice narrowed to an interface language the app actually ships.
function coerceLang(l) {
  return l === 'fil' ? 'fil' : (l === 'en' || l === 'es' ? 'en' : null);
}

export function login(token, user) {
  sessionStorage.setItem('ti_token', token);
  sessionStorage.setItem('ti_user', JSON.stringify(user));
  // Seed the UI language from the account preference ONLY when this device has
  // not already chosen one. A visitor who picked Filipino on the landing page
  // must still be in Filipino after signing in — clobbering that here was why
  // the dashboard reverted to the account default on every login.
  if (!storedLang()) {
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
  // audience. A visitor carrying 'es' in from the landing page reads English in
  // here; their choice stays on disk for when they walk back out to the front.
  return coerceLang(storedLang())
      || coerceLang(getUser()?.language_pref)
      || 'fil';
}

// The visitor's raw choice, for the public marketing surfaces that do speak Spanish.
export function getPublicLang() {
  return storedLang() || coerceLang(getUser()?.language_pref) || 'fil';
}

export function setLang(lang) {
  localStorage.setItem('ti_lang', coerceLang(lang) || 'fil');
}
