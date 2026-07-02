/* =====================================================
 * rppg-core.js — PURE rPPG DSP. Environment-agnostic: importable in the
 * browser (attaches window.RppgCore) AND in Node (module.exports) so the
 * benchmark harness runs the EXACT same math the page runs.
 *
 * Pipeline: per-ROI RGB traces -> POS (primary) + CHROM (cross-check) ->
 * detrend -> band-limited spectral search -> HR; respiration band -> RR;
 * beat detection -> HRV (SDNN/RMSSD) -> stress; agreement + prominence -> SQI.
 * Classical DSP only. No ML weights beyond the caller's face model.
 * ===================================================== */
(function (root) {
  'use strict';

  var HR_FMIN = 0.7, HR_FMAX = 4.0;   // 42..240 bpm
  var RR_FMIN = 0.1, RR_FMAX = 0.5;   // 6..30 breaths/min

  function mean(a) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function std(a) { var m = mean(a), s = 0, i; for (i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(a.length ? s / a.length : 0); }

  // Linear detrend + zero-centre.
  function detrend(x) {
    var n = x.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    var denom = (n * sxx - sx * sx) || 1;
    var slope = (n * sxy - sx * sy) / denom;
    var intercept = (sy - slope * sx) / n;
    var out = new Array(n);
    for (i = 0; i < n; i++) out[i] = x[i] - (slope * i + intercept);
    return out;
  }

  // Normalize a channel by its temporal mean (POS/CHROM prerequisite).
  function meanNormalize(c) {
    var m = mean(c) || 1, i, out = new Array(c.length);
    for (i = 0; i < c.length; i++) out[i] = c[i] / m;
    return out;
  }

  // POS (Wang et al. 2017): P = [[0,1,-1],[-2,1,1]] on normalized RGB.
  function pos(R, G, B) {
    var Rn = meanNormalize(R), Gn = meanNormalize(G), Bn = meanNormalize(B);
    var n = Rn.length, S1 = new Array(n), S2 = new Array(n), i;
    for (i = 0; i < n; i++) { S1[i] = Gn[i] - Bn[i]; S2[i] = -2 * Rn[i] + Gn[i] + Bn[i]; }
    var a = std(S2) ? std(S1) / std(S2) : 0;
    var h = new Array(n);
    for (i = 0; i < n; i++) h[i] = S1[i] + a * S2[i];
    return detrend(h);
  }

  // CHROM (de Haan 2013): Xs = 3R-2G ; Ys = 1.5R+G-1.5B.
  function chrom(R, G, B) {
    var Rn = meanNormalize(R), Gn = meanNormalize(G), Bn = meanNormalize(B);
    var n = Rn.length, Xs = new Array(n), Ys = new Array(n), i;
    for (i = 0; i < n; i++) { Xs[i] = 3 * Rn[i] - 2 * Gn[i]; Ys[i] = 1.5 * Rn[i] + Gn[i] - 1.5 * Bn[i]; }
    var a = std(Ys) ? std(Xs) / std(Ys) : 0;
    var p = new Array(n);
    for (i = 0; i < n; i++) p[i] = Xs[i] - a * Ys[i];
    return detrend(p);
  }

  // Band-limited spectral search over irregular timestamps (Goertzel-style DFT
  // at candidate frequencies). Returns dominant peak + spectral concentration.
  function spectrumPeak(sig, tsec, fmin, fmax, stepHz) {
    var n = sig.length;
    if (n < 40) return { f: 0, power: 0, total: 0, concentration: 0 };
    var t0 = tsec[0], best = { f: 0, power: -1 }, total = 0, count = 0, f, i;
    for (f = fmin; f <= fmax; f += stepHz) {
      var re = 0, im = 0;
      for (i = 0; i < n; i++) {
        var ph = 2 * Math.PI * f * (tsec[i] - t0);
        re += sig[i] * Math.cos(ph);
        im -= sig[i] * Math.sin(ph);
      }
      var p = re * re + im * im;
      total += p; count++;
      if (p > best.power) { best.power = p; best.f = f; }
    }
    var concentration = total > 0 ? (best.power / total) * count : 0; // ~1 = flat, >>1 = sharp peak
    return { f: best.f, power: best.power, total: total, concentration: concentration };
  }

  // Beat detection on the pulse signal -> inter-beat intervals (ms) -> HRV.
  function hrvFromPulse(pulse, tsec) {
    var n = pulse.length, s = std(pulse), i;
    if (n < 60 || s === 0) return { sdnn: null, rmssd: null, beats: 0 };
    var thr = 0.3 * s, peaks = [];
    for (i = 1; i < n - 1; i++) {
      if (pulse[i] > thr && pulse[i] >= pulse[i - 1] && pulse[i] > pulse[i + 1]) {
        // refractory ~300ms to avoid double-count
        if (!peaks.length || (tsec[i] - tsec[peaks[peaks.length - 1]]) > 0.3) peaks.push(i);
      }
    }
    if (peaks.length < 4) return { sdnn: null, rmssd: null, beats: peaks.length };
    var ibi = [];
    for (i = 1; i < peaks.length; i++) ibi.push((tsec[peaks[i]] - tsec[peaks[i - 1]]) * 1000);
    // reject physiologically impossible IBIs (250..2000 ms)
    ibi = ibi.filter(function (v) { return v >= 250 && v <= 2000; });
    if (ibi.length < 3) return { sdnn: null, rmssd: null, beats: peaks.length };
    var sdnn = std(ibi);
    var d2 = 0; for (i = 1; i < ibi.length; i++) d2 += Math.pow(ibi[i] - ibi[i - 1], 2);
    var rmssd = Math.sqrt(d2 / (ibi.length - 1));
    return { sdnn: Math.round(sdnn * 10) / 10, rmssd: Math.round(rmssd * 10) / 10, beats: peaks.length };
  }

  // Map SDNN (ms) -> a coarse 0..100 stress index (lower HRV = higher stress).
  // EXPERIMENTAL heuristic, not a clinical stress measure.
  function stressFromHRV(sdnn) {
    if (sdnn == null) return null;
    var s = Math.max(0, Math.min(100, Math.round(100 - Math.min(100, sdnn))));
    return s;
  }

  // Combine per-ROI traces (quality-weighted; here equal-weight average of
  // whichever ROIs have signal). traces = [{t:[], r:[], g:[], b:[]}, ...].
  function fuseROIs(traces) {
    var valid = traces.filter(function (tr) { return tr && tr.g && tr.g.length > 40; });
    if (!valid.length) return null;
    var ref = valid[0], n = ref.g.length;
    var R = new Array(n), G = new Array(n), B = new Array(n), i, k;
    for (i = 0; i < n; i++) {
      var sr = 0, sg = 0, sb = 0, c = 0;
      for (k = 0; k < valid.length; k++) {
        if (valid[k].r.length > i) { sr += valid[k].r[i]; sg += valid[k].g[i]; sb += valid[k].b[i]; c++; }
      }
      R[i] = c ? sr / c : 0; G[i] = c ? sg / c : 0; B[i] = c ? sb / c : 0;
    }
    return { t: ref.t.slice(0, n), r: R, g: G, b: B };
  }

  // Main entry. Accepts either a single trace {t,r,g,b} or an array of ROI
  // traces. Returns all vitals + SQI. Fields are null when not derivable.
  function estimateVitals(input, opts) {
    opts = opts || {};
    var tr = Array.isArray(input) ? fuseROIs(input) : input;
    if (!tr || !tr.g || tr.g.length < 60) return { bpm: null, sqi: 0, reason: 'insufficient_signal' };
    var tsec = tr.t.map(function (v) { return v / 1000; });

    var pPos = pos(tr.r, tr.g, tr.b);
    var pChrom = chrom(tr.r, tr.g, tr.b);

    var hrPos = spectrumPeak(pPos, tsec, HR_FMIN, HR_FMAX, 0.6 / 60);
    var hrChrom = spectrumPeak(pChrom, tsec, HR_FMIN, HR_FMAX, 0.6 / 60);
    var bpmPos = hrPos.f * 60, bpmChrom = hrChrom.f * 60;

    // Agreement between the two independent algorithms boosts confidence.
    var agree = Math.abs(bpmPos - bpmChrom);
    var bpm = Math.round((bpmPos + bpmChrom) / 2);
    // If they diverge, trust the sharper peak.
    if (agree > 6) bpm = Math.round((hrPos.concentration >= hrChrom.concentration ? bpmPos : bpmChrom));

    // Respiration from the detrended green channel in the respiration band.
    var gDet = detrend(tr.g);
    var rrPeak = spectrumPeak(gDet, tsec, RR_FMIN, RR_FMAX, 0.3 / 60);
    var rr = rrPeak.f > 0 ? Math.round(rrPeak.f * 60) : null;

    // HRV + stress (experimental) from the POS pulse.
    var hrv = hrvFromPulse(pPos, tsec);
    var stress = stressFromHRV(hrv.sdnn);

    // SQI 0..100: peak concentration (capped) + algorithm agreement bonus.
    var conc = Math.min(1, (Math.max(hrPos.concentration, hrChrom.concentration) - 1) / 20);
    var agreeBonus = agree <= 3 ? 0.25 : (agree <= 6 ? 0.1 : 0);
    var durBonus = Math.min(0.15, (tsec[tsec.length - 1] - tsec[0]) / 200);
    var sqi = Math.round(Math.max(0, Math.min(1, conc * 0.75 + agreeBonus + durBonus)) * 100);

    return {
      bpm: (bpm >= 30 && bpm <= 220) ? bpm : null,
      respiratory_bpm: (rr && rr >= 5 && rr <= 40) ? rr : null,
      hrv_sdnn_ms: hrv.sdnn,
      hrv_rmssd_ms: hrv.rmssd,
      stress_index: stress,
      sqi: sqi,
      method: 'pos+chrom',
      agreement_bpm: Math.round(agree * 10) / 10
    };
  }

  var api = {
    estimateVitals: estimateVitals,
    pos: pos, chrom: chrom, detrend: detrend, spectrumPeak: spectrumPeak,
    hrvFromPulse: hrvFromPulse, fuseROIs: fuseROIs,
    HR_FMIN: HR_FMIN, HR_FMAX: HR_FMAX
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RppgCore = api;
})(typeof self !== 'undefined' ? self : this);
