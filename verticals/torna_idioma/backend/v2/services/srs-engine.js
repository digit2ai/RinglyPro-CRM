'use strict';

/**
 * SRS Engine — SM-2 Spaced Repetition Algorithm
 *
 * Implementation based on Piotr Wozniak's SuperMemo-2 (1987).
 * Reference: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
 *
 * Quality scale (what the learner pressed):
 *   0 — complete blackout, no recall
 *   1 — incorrect, but felt familiar when shown
 *   2 — incorrect, but easy to recognize once shown
 *   3 — correct with serious hesitation
 *   4 — correct after hesitation
 *   5 — perfect recall, no hesitation
 *
 * Our UI uses 4 buttons mapping to: Again (0), Hard (3), Good (4), Easy (5).
 *
 * Behavior:
 *   - quality < 3 → reset repetitions to 0, interval to 1 day (relearning)
 *   - quality >= 3 → advance according to standard SM-2 curve
 *   - ease factor (EF) drifts with performance, clamped to [1.3, 2.8]
 */

// Pure function — given current card state + quality, return next state
function calculateNextReview(card, quality) {
  const q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)));
  const prevEase = Number(card.ease_factor) || 2.5;
  const prevRepetitions = Number(card.repetitions) || 0;
  const prevInterval = Number(card.interval_days) || 0;

  let newEase = prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEase < 1.3) newEase = 1.3;
  if (newEase > 2.8) newEase = 2.8;
  newEase = Math.round(newEase * 100) / 100;

  let newRepetitions;
  let newInterval;
  let isLapse = false;

  if (q < 3) {
    // Failed — reset but keep ease factor penalty
    newRepetitions = 0;
    newInterval = 1; // review again in 1 day
    if (prevRepetitions >= 2) isLapse = true; // was learned, now forgotten
  } else {
    newRepetitions = prevRepetitions + 1;
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(prevInterval * newEase);
      if (newInterval < prevInterval + 1) newInterval = prevInterval + 1; // monotonic growth
    }
  }

  const nextReviewAt = new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000);

  return {
    ease_factor: newEase,
    interval_days: newInterval,
    repetitions: newRepetitions,
    next_review_at: nextReviewAt,
    is_lapse: isLapse
  };
}

/**
 * Human-readable label for the SM-2 quality score.
 */
function qualityLabel(q) {
  const labels = {
    0: 'Again',
    3: 'Hard',
    4: 'Good',
    5: 'Easy'
  };
  return labels[q] || String(q);
}

module.exports = {
  calculateNextReview,
  qualityLabel
};
