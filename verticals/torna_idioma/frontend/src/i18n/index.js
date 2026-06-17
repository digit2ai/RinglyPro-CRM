// Shared i18n for Método Rizal surfaces. Interface languages = {en, fil} ONLY.
// Spanish is the SUBJECT taught, never a menu language — no `es` dictionary here.
import en from './en';
import fil from './fil';
import { getLang } from '../services/auth';

const dicts = { en, fil };

// Resolve interface language, coercing any legacy/Spanish value to en|fil.
export function uiLang() {
  const l = getLang();
  return l === 'fil' ? 'fil' : 'en';
}

// Translate a flat dotted key for the active interface language.
export function tr(key) {
  const d = dicts[uiLang()] || en;
  return d[key] ?? en[key] ?? key;
}

// Full dictionary for a given lang (for components that prefer a local handle).
export function dict(lang) {
  return dicts[lang === 'fil' ? 'fil' : 'en'] || en;
}

export default { tr, uiLang, dict };
