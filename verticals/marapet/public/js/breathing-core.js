/**
 * MaraPet breathing-rate estimator — DETERMINISTIC SIGNAL PROCESSING, NO MODEL.
 *
 * ONE FILE, TWO CALLERS: the browser loads it with a <script> tag and the
 * server (and the SIT) require() it. A second copy is how the number on the
 * phone and the number in the test start disagreeing.
 *
 * Input is a one-dimensional series: the mean brightness of the chest region of
 * interest, one value per video frame. Breathing moves the chest, which changes
 * how much light that region reflects, so the series carries the respiratory
 * period as its dominant low-frequency component.
 *
 * WHAT IT REFUSES TO DO. Below a confidence floor it returns no number and says
 * why. A plausible wrong breathing rate is worse than no reading, because the
 * owner would act on it: thirty-two breaths a minute is the figure a
 * cardiologist asks them to call about.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MaraPetBreathing = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // A dog at rest breathes between about 6 and 120 times a minute. Outside that
  // band a peak is a camera artefact, a wagging tail or a person moving.
  var MIN_BPM = 6;
  var MAX_BPM = 120;
  var MIN_SECONDS = 20;        // under this, too few cycles to be sure of any of it
  var MIN_CYCLES = 3;          // the peak must repeat, not merely exist

  // THE THRESHOLD IS DERIVED, NOT PICKED, AND THE FIRST VERSION OF THIS FILE
  // WAS WRONG. It compared the strongest frequency against the MEDIAN in-band
  // power and refused below 1.6, which let thirty seconds of pure camera noise
  // come back as "102 breaths a minute, high confidence" — precisely the
  // confident-wrong-number this module exists to refuse.
  //
  // The reason is statistical, not a tuning mistake: in the periodogram of a
  // noise signal the bin powers are roughly exponentially distributed, so the
  // LARGEST of N bins is naturally about ln(N) times the average simply because
  // it is the largest. Across a 0.1-2 Hz band observed for 30 s there are
  // ~57 statistically independent bins, so noise alone earns a ratio near 4-8.
  //
  // So the floor scales with the number of bins actually searched (Fisher's
  // test for periodicity): P(max/mean > g) ~ Neff * exp(-g), which for a 1%
  // false-alarm rate gives g > ln(Neff) + ln(100). The bands below were then
  // CHECKED by measurement, not by argument: scripts/calibrate-breathing.js
  // runs pure noise and known-rate signals through it and reports the measured
  // false-alarm and recovery rates.
  var FALSE_ALARM = 0.01;
  var CONF_MED_MARGIN = 2.0;   // this much above the floor -> medium
  var CONF_HIGH_MARGIN = 5.0;  // this much above the floor -> high

  function mean(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  /** Remove slow drift (camera auto-exposure, the dog settling) with a moving average. */
  function detrend(series, win) {
    var n = series.length;
    var out = new Array(n);
    var half = Math.max(1, Math.floor(win / 2));
    var acc = 0;
    var q = [];
    for (var i = 0; i < n; i++) {
      q.push(series[i]); acc += series[i];
      if (q.length > 2 * half + 1) acc -= q.shift();
      out[i] = series[i] - acc / q.length;
    }
    return out;
  }

  /** Hann window — without it the spectrum smears and a strong peak looks weak. */
  function hann(a) {
    var n = a.length;
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = a[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    return out;
  }

  /** Power at one frequency (Goertzel) — cheaper and clearer than a full FFT here. */
  function goertzel(a, freq, fs) {
    var n = a.length;
    var w = 2 * Math.PI * freq / fs;
    var coeff = 2 * Math.cos(w);
    var s0 = 0, s1 = 0, s2 = 0;
    for (var i = 0; i < n; i++) {
      s0 = a[i] + coeff * s1 - s2;
      s2 = s1; s1 = s0;
    }
    return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / (n * n);
  }

  function median(a) {
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /**
   * estimate(series, fps) -> one of:
   *   { ok:true,  bpm, confidence:'high'|'medium'|'low', seconds, cycles, prominence }
   *   { ok:false, reason, seconds }
   */
  function estimate(series, fps) {
    if (!series || typeof series.length !== 'number' || !(fps > 0)) {
      return { ok: false, reason: 'no_signal' };
    }
    var n = series.length;
    var seconds = n / fps;
    if (seconds < MIN_SECONDS) {
      return { ok: false, reason: 'clip_too_short', seconds: Math.round(seconds * 10) / 10 };
    }

    // A frozen frame, a covered lens or a still image: no variation to read.
    var mu = mean(series);
    var varsum = 0;
    for (var i = 0; i < n; i++) varsum += (series[i] - mu) * (series[i] - mu);
    if (Math.sqrt(varsum / n) < 1e-6) {
      return { ok: false, reason: 'no_variation', seconds: Math.round(seconds * 10) / 10 };
    }

    // Detrend over ~4s so the respiratory band survives but drift does not.
    var sig = hann(detrend(series, Math.max(3, Math.round(fps * 4))));

    var powers = [];
    var bestP = -1, bestF = 0;
    var stepBpm = 0.25;
    for (var bpm = MIN_BPM; bpm <= MAX_BPM + 1e-9; bpm += stepBpm) {
      var f = bpm / 60;
      if (f >= fps / 2) break;              // above Nyquist there is nothing to read
      var p = goertzel(sig, f, fps);
      powers.push(p);
      if (p > bestP) { bestP = p; bestF = f; }
    }
    if (!powers.length) return { ok: false, reason: 'frame_rate_too_low', seconds: Math.round(seconds * 10) / 10 };

    // Against the MEAN, because that is the statistic the false-alarm bound below
    // is derived for. The median is a fine descriptive figure and a bad test.
    var sum = 0;
    for (var k = 0; k < powers.length; k++) sum += powers[k];
    var avg = sum / powers.length;
    var prominence = avg > 0 ? bestP / avg : 0;
    var bpmOut = bestF * 60;
    var cycles = bestF * seconds;

    // Independent bins ~= observation length x searched bandwidth. The 0.25-bpm
    // scan step oversamples deliberately (it sharpens the reported rate) and
    // must NOT be counted as extra evidence, which is why Neff is computed from
    // the physics rather than from powers.length.
    var bandHz = (Math.min(MAX_BPM, fps * 30) - MIN_BPM) / 60;
    var neff = Math.max(2, seconds * bandHz);
    var floor = Math.log(neff) + Math.log(1 / FALSE_ALARM);

    if (cycles < MIN_CYCLES) {
      return {
        ok: false, reason: 'too_few_cycles',
        seconds: Math.round(seconds * 10) / 10,
        cycles: Math.round(cycles * 10) / 10
      };
    }
    if (!(prominence >= floor)) {
      return {
        ok: false, reason: 'signal_too_noisy',
        seconds: Math.round(seconds * 10) / 10,
        prominence: Math.round(prominence * 100) / 100,
        needed: Math.round(floor * 100) / 100
      };
    }

    var confidence = prominence >= floor + CONF_HIGH_MARGIN ? 'high'
      : prominence >= floor + CONF_MED_MARGIN ? 'medium' : 'low';

    return {
      ok: true,
      bpm: Math.round(bpmOut * 10) / 10,
      confidence: confidence,
      seconds: Math.round(seconds * 10) / 10,
      cycles: Math.round(cycles * 10) / 10,
      prominence: Math.round(prominence * 100) / 100,
      needed: Math.round(floor * 100) / 100
    };
  }

  return {
    estimate: estimate,
    MIN_BPM: MIN_BPM, MAX_BPM: MAX_BPM, MIN_SECONDS: MIN_SECONDS,
    MIN_CYCLES: MIN_CYCLES, FALSE_ALARM: FALSE_ALARM,
    _internals: { detrend: detrend, goertzel: goertzel, median: median }
  };
}));
