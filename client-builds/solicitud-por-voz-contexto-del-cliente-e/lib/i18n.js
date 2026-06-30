// =====================================================
// Two flat dictionaries (es default, en). No i18next. selectLang() picks one.
// =====================================================

const ES = {
  title: 'Visibilidad Financiera · Comercializadora de Palma',
  h1: 'Visibilidad Financiera en Vivo',
  subtitle: '¿Cuánto estás vendiendo y cuánto estás ganando? Registra tus operaciones en dólares y míralo en tiempo real.',
  lbl_sales: 'Total Vendido',
  lbl_purchases: 'Total Comprado',
  lbl_margin: 'Ganancia / Pérdida',
  lbl_net: 'Posición Neta USD',
  card_form: 'Registrar operación',
  f_type: 'Tipo',
  opt_sale: 'Venta',
  opt_purchase: 'Compra',
  opt_import: 'Importación',
  f_amount: 'Monto (USD)',
  f_counterparty: 'Contraparte (cliente / proveedor)',
  btn_add: 'Registrar',
  card_voice: 'Solicitud por voz',
  voice_hint: 'Dicta o pega la transcripción y la convertimos en una operación. Ej: "vendí 5000 dólares de palma a Acme".',
  voice_ph: 'vendí 5000 dólares de palma a Acme',
  btn_voice: 'Procesar por voz',
  card_tx: 'Últimas operaciones',
  th_type: 'Tipo', th_amount: 'Monto USD', th_party: 'Contraparte', th_src: 'Origen',
  empty: 'Aún no hay operaciones registradas.',
  need_token: 'Datos financieros internos: inicia sesión (token) para ver las cifras.',
  privacy: 'Privacidad',
  toggle: 'EN'
};

const EN = {
  title: 'Financial Visibility · Palm Trading',
  h1: 'Live Financial Visibility',
  subtitle: 'How much are you selling and how much are you making? Log your USD operations and see it in real time.',
  lbl_sales: 'Total Sold',
  lbl_purchases: 'Total Bought',
  lbl_margin: 'Profit / Loss',
  lbl_net: 'Net USD Position',
  card_form: 'Log an operation',
  f_type: 'Type',
  opt_sale: 'Sale',
  opt_purchase: 'Purchase',
  opt_import: 'Import',
  f_amount: 'Amount (USD)',
  f_counterparty: 'Counterparty (client / supplier)',
  btn_add: 'Add',
  card_voice: 'Voice request',
  voice_hint: 'Dictate or paste the transcript and we turn it into an operation. E.g. "vendí 5000 dólares de palma a Acme".',
  voice_ph: 'I sold 5000 dollars of palm to Acme',
  btn_voice: 'Process voice',
  card_tx: 'Latest operations',
  th_type: 'Type', th_amount: 'Amount USD', th_party: 'Counterparty', th_src: 'Source',
  empty: 'No operations logged yet.',
  need_token: 'Internal financial data: sign in (token) to see the figures.',
  privacy: 'Privacy',
  toggle: 'ES'
};

function selectLang(lang) { return lang === 'en' ? EN : ES; }

module.exports = { ES, EN, selectLang };
