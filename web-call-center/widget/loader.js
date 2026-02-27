/**
 * Web Call Center - Widget Loader
 * Lightweight script that customers embed on their website.
 * Loads the full widget script + CSS and initializes it.
 *
 * Usage:
 * <script src="https://aiagent.ringlypro.com/webcallcenter/widget/loader.js"
 *         data-widget-id="wcc_abc123"></script>
 */
(function() {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var widgetId = script.getAttribute('data-widget-id');
  if (!widgetId) {
    console.error('[WCC Widget] Missing data-widget-id attribute');
    return;
  }

  // Derive API base from script src
  var apiBase = script.src.replace('/widget/loader.js', '');

  // Load widget CSS
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = apiBase + '/widget/widget.css';
  document.head.appendChild(css);

  // Load full widget script
  var widgetScript = document.createElement('script');
  widgetScript.src = apiBase + '/widget/widget.js';
  widgetScript.onload = function() {
    if (window.WCCWidget) {
      window.WCCWidget.init({
        widgetId: widgetId,
        apiBase: apiBase
      });
    }
  };
  document.head.appendChild(widgetScript);
})();
