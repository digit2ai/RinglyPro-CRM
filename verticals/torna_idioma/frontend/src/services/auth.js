export function login(token, user) {
  sessionStorage.setItem('ti_token', token);
  sessionStorage.setItem('ti_user', JSON.stringify(user));
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
  const user = getUser();
  return user?.language_pref || localStorage.getItem('ti_lang') || 'en';
}

export function setLang(lang) {
  localStorage.setItem('ti_lang', lang);
}
