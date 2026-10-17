'use strict';
/**
 * Server-side handle on the breathing estimator. The ALGORITHM lives in
 * ../../public/js/breathing-core.js, which the browser loads with a <script>
 * tag — one file, two callers, so the figure the owner sees on their phone and
 * the figure the SIT asserts cannot drift apart.
 *
 * The video itself NEVER reaches this server. The browser extracts the chest-ROI
 * brightness series on-device and posts only that series (or only the resulting
 * number). A recording of the inside of somebody's home is not ours to hold.
 */
module.exports = require('../../public/js/breathing-core.js');
