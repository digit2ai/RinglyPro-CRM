import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { authTranslations } from '../features/auth/languages'
import { homeTranslations } from '../shared/languages/home'

void i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],

  ns: ['auth', 'home'],
  defaultNS: 'home',

  resources: {
    es: {
      auth: authTranslations.es,
      home: homeTranslations.es,
    },
    en: {
      auth: authTranslations.en,
      home: homeTranslations.en,
    },
  },

  interpolation: {
    escapeValue: false,
  },

  react: {
    useSuspense: false,
  },
})

export default i18n
