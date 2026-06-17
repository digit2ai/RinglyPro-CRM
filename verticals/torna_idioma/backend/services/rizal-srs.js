'use strict';

/**
 * SM-2 spaced-repetition scheduler for the Método Rizal Cinco Raíces engine.
 *
 * Pure functions — no DB. The route layer reads the current SRS state for a
 * (user, root), calls schedule(), and persists the returned next state.
 *
 * Quality grade `q` is 0..5 (SuperMemo scale):
 *   0-2 = incorrect/forgot (lapse)   3 = correct but hard
 *   4   = correct                    5 = perfect
 *
 * A root counts as "mastered" once its interval reaches MASTERY_INTERVAL_DAYS.
 */

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;
const MASTERY_INTERVAL_DAYS = 21;

function clampEase(e) {
  return Math.max(MIN_EASE, e);
}

/**
 * @param {{ease?:number, interval_days?:number, reps?:number, lapses?:number}} prev
 * @param {number} q  quality 0..5
 * @param {Date} [now]
 * @returns {{ease:number, interval_days:number, reps:number, lapses:number,
 *            due_date:string, mastered:boolean}}
 */
function schedule(prev = {}, q, now = new Date()) {
  let ease = typeof prev.ease === 'number' ? prev.ease : DEFAULT_EASE;
  let interval = typeof prev.interval_days === 'number' ? prev.interval_days : 0;
  let reps = typeof prev.reps === 'number' ? prev.reps : 0;
  let lapses = typeof prev.lapses === 'number' ? prev.lapses : 0;

  const grade = Math.max(0, Math.min(5, Math.round(Number(q))));

  if (grade >= 3) {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  } else {
    reps = 0;
    interval = 1;
    lapses += 1;
  }

  // SM-2 ease update
  ease = clampEase(ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

  const due = new Date(now);
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + interval);
  const due_date = due.toISOString().slice(0, 10);

  return {
    ease: Math.round(ease * 1000) / 1000,
    interval_days: interval,
    reps,
    lapses,
    due_date,
    mastered: interval >= MASTERY_INTERVAL_DAYS,
  };
}

module.exports = { schedule, MASTERY_INTERVAL_DAYS, DEFAULT_EASE };
