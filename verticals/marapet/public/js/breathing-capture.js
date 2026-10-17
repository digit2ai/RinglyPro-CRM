/* The camera half of the breathing check.
   THE VIDEO NEVER LEAVES THE PHONE. This file samples the brightness of the
   chest region frame by frame into a plain number series, runs the SAME
   estimator the server and the SIT use (breathing-core.js), and posts the
   series plus the resulting figure. No frame, no still and no recording is
   uploaded, and none is kept after the check ends. */
(function () {
  'use strict';

  var SECONDS = 30;

  function t(lang, en, es) { return lang === 'es' ? es : en; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var REASON = {
    clip_too_short:   { en: 'The clip was too short. Hold still for the full thirty seconds.', es: 'El video fue muy corto. Mantén el teléfono quieto los treinta segundos completos.' },
    no_variation:     { en: 'Nothing was moving in the frame. Point the camera at your dog’s chest.', es: 'Nada se movía en la imagen. Apunta la cámara al pecho de tu perro.' },
    signal_too_noisy: { en: 'Too much movement to read a breathing rate. Try again when your dog is settled and hold the phone steady.', es: 'Demasiado movimiento para leer la respiración. Intenta de nuevo cuando tu perro esté tranquilo y sostén el teléfono firme.' },
    too_few_cycles:   { en: 'Not enough breaths were visible to be sure. Try a longer, steadier clip.', es: 'No se vieron suficientes respiraciones para estar seguros. Intenta un video más largo y estable.' },
    frame_rate_too_low: { en: 'The camera frame rate was too low on this device.', es: 'La tasa de cuadros de la cámara fue muy baja en este dispositivo.' },
    no_signal:        { en: 'The camera did not produce a usable signal.', es: 'La cámara no entregó una señal utilizable.' }
  };

  function mount(el, opts) {
    var lang = opts.lang === 'es' ? 'es' : 'en';
    var base = opts.base || '';
    el.innerHTML =
      '<div id="bcState" class="mp-mut">' + esc(t(lang, 'Ready.', 'Listo.')) + '</div>' +
      '<video id="bcVid" playsinline muted style="width:100%;max-width:360px;border-radius:12px;background:#000;margin-top:10px" hidden></video>' +
      '<canvas id="bcCan" width="64" height="64" style="display:none"></canvas>' +
      '<div class="mp-row" style="margin-top:12px">' +
      '<button class="mp-btn mp-btn--primary" id="bcGo">' + esc(t(lang, 'Start the 30-second check', 'Empezar el chequeo de 30 segundos')) + '</button>' +
      '<button class="mp-btn mp-btn--ghost" id="bcStop" hidden>' + esc(t(lang, 'Stop', 'Detener')) + '</button>' +
      '</div><div id="bcOut" style="margin-top:14px"></div>';

    var vid = el.querySelector('#bcVid');
    var can = el.querySelector('#bcCan');
    var ctx = can.getContext('2d', { willReadFrequently: true });
    var stream = null, raf = null, series = [], t0 = 0, running = false;

    function say(msg) { el.querySelector('#bcState').textContent = msg; }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (stream) { stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; }
      vid.hidden = true;
      el.querySelector('#bcStop').hidden = true;
      el.querySelector('#bcGo').hidden = false;
    }

    function sample() {
      if (!running) return;
      // The centre of frame, downscaled hard: we need one brightness number per
      // frame, not an image. A 64x64 draw is also what keeps this cheap enough
      // to run for thirty seconds on a phone without heating it.
      ctx.drawImage(vid, 0, 0, 64, 64);
      var d;
      try { d = ctx.getImageData(16, 16, 32, 32).data; } catch (_) { stop(); say(t(lang, 'The camera could not be read.', 'No se pudo leer la cámara.')); return; }
      var s = 0;
      for (var i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      series.push(s / (d.length / 4));

      var elapsed = (Date.now() - t0) / 1000;
      say(t(lang, 'Watching… ', 'Observando… ') + Math.floor(elapsed) + 's / ' + SECONDS + 's');
      if (elapsed >= SECONDS) { finish(elapsed); return; }
      raf = requestAnimationFrame(sample);
    }

    async function finish(elapsed) {
      var captured = series.slice();
      var fps = captured.length / elapsed;
      stop();
      say(t(lang, 'Working it out…', 'Calculando…'));

      // Estimated on-device first, so an offline phone still gets its answer.
      var local = window.MaraPetBreathing
        ? window.MaraPetBreathing.estimate(captured, fps)
        : { ok: false, reason: 'no_signal' };

      var out = el.querySelector('#bcOut');
      if (!local.ok) {
        var r = REASON[local.reason] || { en: local.reason, es: local.reason };
        out.innerHTML = '<div class="mp-empty"><h4 style="margin-top:0">' +
          esc(t(lang, 'No reading this time', 'Sin lectura esta vez')) + '</h4><p style="margin:0">' +
          esc(r[lang]) + '</p></div>';
        say(t(lang, 'Ready.', 'Listo.'));
        return;
      }

      try {
        var res = await fetch(base + '/api/v1/pets/' + opts.petId + '/breathing', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          // The SERIES, never the video. The server recomputes rather than
          // trusting the phone's figure, so one estimator decides.
          body: JSON.stringify({ series: captured.map(function (v) { return Math.round(v * 1000) / 1000; }), fps: fps })
        });
        var j = await res.json().catch(function () { return {}; });
        if (!j.measured) {
          var rr = REASON[j.reason] || { en: j.reason || 'unknown', es: j.reason || 'desconocido' };
          out.innerHTML = '<div class="mp-empty"><h4 style="margin-top:0">' +
            esc(t(lang, 'No reading this time', 'Sin lectura esta vez')) + '</h4><p style="margin:0">' +
            esc(rr[lang]) + '</p></div>';
        } else {
          var pill = j.status === 'ok' ? 'mp-pill--ok' : (j.status ? 'mp-pill--warn' : '');
          out.innerHTML = '<div class="mp-card">' +
            '<div class="mp-metric"><span class="mp-metric__v">' + esc(j.bpm) + '</span>' +
            '<span class="mp-metric__u">' + esc(t(lang, 'breaths/min', 'resp/min')) + '</span></div>' +
            '<p style="margin:8px 0 0"><span class="mp-prov">' +
            esc(t(lang, 'estimate from video', 'estimación por video')) + ' &middot; ' + esc(j.confidence) + '</span></p>' +
            (j.status ? '<p style="margin:8px 0 0"><span class="mp-pill ' + pill + '">' +
              esc(j.status === 'ok' ? t(lang, 'Inside the reference range', 'Dentro del rango de referencia')
                : t(lang, 'Outside the reference range — worth mentioning to your vet', 'Fuera del rango de referencia: vale la pena comentarlo con tu veterinario')) +
              '</span></p>' : '') +
            (j.band ? '<p class="mp-note" style="margin:8px 0 0">' +
              esc(t(lang, 'Reference ', 'Referencia ') + j.band.min + '–' + j.band.max + ' ' + (j.band.unit || '')) + '</p>' : '') +
            '</div>';
          if (typeof opts.onStored === 'function') opts.onStored(j);
        }
      } catch (_) {
        out.innerHTML = '<p class="mp-err">' + esc(t(lang, 'The reading could not be saved. Your dog is fine; the connection was not.', 'No se pudo guardar la lectura. Tu perro está bien; la conexión no.')) + '</p>';
      }
      say(t(lang, 'Ready.', 'Listo.'));
    }

    el.querySelector('#bcGo').addEventListener('click', async function () {
      el.querySelector('#bcOut').innerHTML = '';
      series = [];
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
      } catch (_) {
        say(t(lang, 'Camera permission is needed for the breathing check.', 'Se necesita permiso de cámara para el chequeo de respiración.'));
        return;
      }
      vid.srcObject = stream;
      vid.hidden = false;
      await vid.play().catch(function () {});
      this.hidden = true;
      el.querySelector('#bcStop').hidden = false;
      running = true;
      t0 = Date.now();
      raf = requestAnimationFrame(sample);
    });

    el.querySelector('#bcStop').addEventListener('click', function () {
      stop();
      say(t(lang, 'Stopped. Nothing was saved.', 'Detenido. No se guardó nada.'));
    });

    // Leaving the page must release the camera.
    window.addEventListener('pagehide', stop);
  }

  window.MaraPetCapture = { mount: mount, SECONDS: SECONDS };
}());
