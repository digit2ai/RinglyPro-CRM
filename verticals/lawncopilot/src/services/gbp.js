'use strict';

/**
 * Lawn Co-Pilot — Google Business Profile helper
 *
 * WHAT IS AND ISN'T POSSIBLE (the honest answer):
 *
 * Fully automatic "give us your Google password and we create the listing" is
 * NOT possible, and we will not build it:
 *   1. Google forbids password-based automation (ToS), and 2FA makes it a
 *      non-starter. There is no password API. Asking for a Google password is a
 *      phishing pattern — we never collect it.
 *   2. The Business Profile API is OAuth-only, and the API itself is gated:
 *      Google must approve the project for Business Profile access.
 *   3. A NEW listing must pass Google's own verification (postcard / phone /
 *      video) that only the business owner can complete. It cannot be headless.
 *
 * What IS possible, and is what this builds:
 *   - SEMI-AUTOMATED: we assemble every field from the company's record, hand it
 *     over pre-filled with one-tap copy, deep-link straight into Google's create
 *     flow, and give the exact Website / Booking URL to paste (the whole point —
 *     Google points at their Lawn Co-Pilot page).
 *   - FUTURE (real automation): once GOOGLE_BUSINESS_PROFILE_KEY is set and the
 *     owner connects via OAuth, we can READ their listing and PATCH the website
 *     URL through the API. That path plugs in here without changing this helper.
 *
 * Landscapers are SERVICE-AREA businesses: no storefront address is listed, just
 * the counties served — which is precisely how this is assembled.
 */

const { tenantBaseUrl, shortLinkUrl } = require('../tenancy');

const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function to12h(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ap}`;
}

function hoursLines(tenant) {
  const bh = tenant.business_hours || {};
  return DAY_ORDER.map(d => {
    const v = bh[d];
    return { day: DAY_LABEL[d], hours: (v && v[0] && v[1]) ? `${to12h(v[0])} – ${to12h(v[1])}` : 'Closed' };
  });
}

/**
 * Everything the owner needs to create (or fix) their Google listing, ready to
 * copy, plus a guided checklist. Zero external keys.
 */
function buildListing(tenant, req) {
  const website = tenantBaseUrl(tenant, req);
  const booking = tenant.short_code ? shortLinkUrl(tenant.short_code, req) : website;
  const phone = tenant.phone || tenant.owner_phone || null;
  const areas = Array.isArray(tenant.counties) && tenant.counties.length
    ? tenant.counties.map(c => `${c} County, ${tenant.state || 'FL'}`)
    : [`${tenant.state || 'FL'}`];
  const about = (tenant.brand && tenant.brand.about) ||
    `${tenant.name} is a local, owner-operated lawn care company. Get an instant measured quote and book online at ${website}.`;

  const fields = [
    { key: 'name', label: 'Business name', value: tenant.name, hint: 'Exactly as it should appear on Google.' },
    { key: 'category', label: 'Primary category', value: 'Lawn care service', hint: 'Type this and pick it from Google\'s list.' },
    { key: 'category2', label: 'Additional categories', value: 'Landscaper, Lawn mowing service', hint: 'Add these too — they help you show up.' },
    { key: 'phone', label: 'Phone number', value: phone || '(add your Receptionist number)', hint: 'Use your Lawn Co-Pilot number so the AI answers.' },
    { key: 'website', label: 'Website', value: website, hint: 'THIS is the key step — your Lawn Co-Pilot page is your website.' },
    { key: 'booking', label: 'Appointment / booking link', value: booking, hint: 'Set as the "Appointments" link so the Book button quotes them.' },
    { key: 'description', label: 'Business description', value: about, hint: 'Up to 750 characters.' }
  ];

  const steps = [
    { n: 1, title: 'Start your listing', detail: 'Open Google\'s create flow and sign in with the Google account you use for the business.', action: 'https://business.google.com/create' },
    { n: 2, title: 'Enter your business name and category', detail: 'Paste the name below. For type, choose "Lawn care service".' },
    { n: 3, title: 'Choose "I deliver to customers" (no storefront)', detail: 'You are a service-area business. Skip the address; add the service areas below instead.' },
    { n: 4, title: 'Add your service areas', detail: 'Add each county you serve so you appear in those searches.' },
    { n: 5, title: 'Add your phone and website', detail: 'Use your Lawn Co-Pilot number and set the website to your page below — this is what turns your listing into a booking engine.' },
    { n: 6, title: 'Verify your business', detail: 'Google will verify by postcard, phone or video. Only you can do this step — it usually takes a few days.' },
    { n: 7, title: 'Set the Website and Booking buttons', detail: 'Once verified, set both links to your Lawn Co-Pilot page. Every "Website" or "Book" tap lands on your quote-and-book page.' }
  ];

  return {
    business_type: 'service_area',
    fields,
    service_areas: areas,
    hours: hoursLines(tenant),
    website_url: website,
    booking_url: booking,
    logo_url: (tenant.brand && tenant.brand.logo_url) || null,
    create_url: 'https://business.google.com/create',
    manage_url: 'https://business.google.com/',
    steps,
    automation: {
      full_auto_possible: false,
      reason: 'Google has no password API, requires OAuth with an approved project, and a new listing must pass owner-only verification (postcard/phone/video). A tool that collected a Google password would be unsafe and against Google policy.',
      what_we_do: 'Everything is pre-filled and one-tap copyable, with a deep link into Google\'s create flow and the exact website/booking URL to paste.',
      future_oauth: !!process.env.GOOGLE_BUSINESS_PROFILE_KEY
        ? 'OAuth automation is configured: once you connect Google, we can read your listing and set the website link through the Business Profile API.'
        : 'When enabled, connecting Google via OAuth will let us set the website link on your listing automatically (Business Profile API).'
    }
  };
}

module.exports = { buildListing };
