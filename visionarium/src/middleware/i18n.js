const SPANISH_COUNTRIES = [
  'MX','CO','AR','PE','CL','EC','GT','CU','BO','DO','HN','PY',
  'SV','NI','CR','PA','UY','VE','ES','GQ'
];

function detectLanguage(req, res, next) {
  // Priority: query param > header > default
  req.lang = req.query.lang || req.headers['x-lang'] || 'en';
  if (!['en', 'es'].includes(req.lang)) req.lang = 'en';
  next();
}

function geoToLanguage(countryCode) {
  return SPANISH_COUNTRIES.includes(countryCode) ? 'es' : 'en';
}

module.exports = { detectLanguage, geoToLanguage, SPANISH_COUNTRIES };
