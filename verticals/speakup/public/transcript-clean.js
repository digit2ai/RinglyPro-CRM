/* AutoDev — removes Whisper's repetition loops from a transcript.
 *
 * ONE FILE, TWO CALLERS. The browser loads it before record-engine.js and the server
 * requires it in the transcript routes, so the rule that cleans a segment on the phone and
 * the rule that cleans the whole transcript on save cannot drift apart.
 *
 * WHY THIS EXISTS. Whisper decodes each 30-second window autoregressively: every word it
 * writes becomes context for the next. On unclear audio it can lock onto a phrase and repeat
 * it until it hits its 448-token ceiling for the window. A real meeting came back 88% loop —
 * one phrase 86 times in a row, another 65 times. OpenAI's reference implementation guards
 * against this by re-decoding any window whose text compresses too well (gzip ratio above
 * 2.4); the loops measured 28-32, the real speech 1.42. transformers.js implements none of
 * those checks (compression_ratio_threshold, logprob_threshold, no_speech_threshold), so
 * nothing stopped them.
 *
 * WHAT IT DOES NOT DO. It cannot recover the speech a loop replaced: the model spent that
 * window repeating instead of transcribing, and the audio never leaves the device. It only
 * stops the loop from burying the words that DID come through, and from polluting every
 * summary and extraction built on the transcript afterwards.
 *
 * THE THRESHOLD IS THREE COPIES IN A ROW, AND TWO ARE LEFT ALONE. People do say the same
 * sentence twice. Three identical copies back to back is a decoder artefact far more often
 * than it is speech, and collapsing a genuine "no, no, no" to one "no" loses nothing a
 * reader needs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpeakUpTranscript = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MIN_COPIES = 3;   // copies in a row before a phrase counts as a loop
  var MAX_PHRASE = 25;  // longest repeating unit considered, in words

  // Compare words by what they say, not how they are written: the same phrase comes back
  // with different capitals and trailing punctuation ("the..." / "the.").
  function norm(w) {
    var s = String(w).toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');
    return s || w; // a bare punctuation token keeps its own identity rather than matching everything
  }

  function sameRun(n, a, b, len) {
    for (var t = 0; t < len; t++) if (n[a + t] !== n[b + t]) return false;
    return true;
  }

  // Collapse every run of MIN_COPIES or more consecutive copies of one phrase down to its
  // first copy, keeping that copy's original spelling. The SHORTEST repeating unit wins:
  // an 8-word window over a 4-word loop also "repeats", and collapsing to it would leave two
  // copies behind.
  function collapseRepeats(text) {
    var src = String(text == null ? '' : text);
    var words = src.split(/\s+/).filter(Boolean);
    if (words.length < MIN_COPIES) return { text: src.trim(), removed: 0, loops: 0 };
    var n = words.map(norm);
    var out = [], removed = 0, loops = 0, i = 0;
    while (i < words.length) {
      var hit = null;
      for (var len = 1; len <= MAX_PHRASE && i + MIN_COPIES * len <= words.length; len++) {
        var copies = 1;
        while (i + (copies + 1) * len <= words.length && sameRun(n, i, i + copies * len, len)) copies++;
        if (copies >= MIN_COPIES) { hit = { len: len, copies: copies }; break; }
      }
      if (hit) {
        for (var k = 0; k < hit.len; k++) out.push(words[i + k]);
        removed += (hit.copies - 1) * hit.len;
        loops++;
        i += hit.copies * hit.len;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    return { text: out.join(' '), removed: removed, loops: loops };
  }

  return { collapseRepeats: collapseRepeats, MIN_COPIES: MIN_COPIES, MAX_PHRASE: MAX_PHRASE };
});
