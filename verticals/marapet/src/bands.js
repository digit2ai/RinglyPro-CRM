'use strict';
/**
 * Normal bands — deterministic arithmetic, never a model call.
 *
 * A band is a PUBLISHED REFERENCE RANGE, not a MaraPet measurement and not a
 * diagnosis. The figures below come from general veterinary references and are
 * cited per metric; they are not derived from any study MaraPet has run,
 * because MaraPet has not run one. `basis` travels with every band to the
 * screen for exactly that reason.
 *
 * A model is never asked for one of these numbers: an owner has to be able to
 * see why a reading was flagged, and a figure that differs between runs cannot
 * be explained to them or to their vet.
 */

const SIZES = ['toy', 'small', 'medium', 'large', 'giant'];

// Weight -> size, used only when the owner has not stated a size.
function sizeFromWeight(kg) {
  const w = Number(kg);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (w < 5) return 'toy';
  if (w < 12) return 'small';
  if (w < 27) return 'medium';
  if (w < 45) return 'large';
  return 'giant';
}

function ageMonths(birth_date, now) {
  if (!birth_date) return null;
  const b = new Date(birth_date);
  if (Number.isNaN(b.getTime())) return null;
  const n = now ? new Date(now) : new Date();
  const m = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  return m - (n.getDate() < b.getDate() ? 1 : 0);
}

const HR_BY_SIZE = {
  toy:    [100, 160],
  small:  [100, 140],
  medium: [ 70, 120],
  large:  [ 60, 110],
  giant:  [ 60, 100]
};

const HR_BASIS =
  'Published resting heart-rate range for this body size (small dogs run faster than large ones). ' +
  'Reference range, not a MaraPet measurement.';

/**
 * Bands for one pet. Returns a map of metric -> {min,max,unit,basis} and
 * OMITS any metric it cannot state for this pet rather than guessing one.
 */
function forPet(pet, now) {
  const out = {};
  const size = (pet && SIZES.includes(pet.breed_size) ? pet.breed_size : null)
    || sizeFromWeight(pet && pet.weight_kg);
  const months = ageMonths(pet && pet.birth_date, now);

  if (size) {
    let [min, max] = HR_BY_SIZE[size];
    // A puppy's resting rate is genuinely higher; widening the ceiling is what
    // stops a healthy 3-month-old alerting every night.
    if (months !== null && months < 6) {
      max = Math.round(max * 1.35);
      out.heart_rate_bpm = {
        min, max, unit: 'bpm',
        basis: HR_BASIS + ' Upper bound widened because this dog is under six months old.'
      };
    } else {
      out.heart_rate_bpm = { min, max, unit: 'bpm', basis: HR_BASIS };
    }
  }
  // No size and no weight on file: the band is ABSENT, not a population average.
  // The screen says "add a weight to see the normal range" instead of showing
  // a band that is wrong for this dog.

  out.resp_rate_bpm = {
    min: 10, max: 30, unit: 'breaths/min',
    basis:
      'Published resting and sleeping respiratory rate for adult dogs. A sustained sleeping ' +
      'rate above thirty breaths a minute is the figure veterinary cardiologists ask owners ' +
      'to watch. Reference range, not a MaraPet measurement.'
  };

  out.temp_c = {
    min: 37.5, max: 39.2, unit: 'C',
    basis:
      'Published rectal temperature range for dogs. A collar reads SKIN temperature, not core, ' +
      'so a device reading is labelled as skin and is not comparable to this range.'
  };

  out.spo2_pct = {
    min: 95, max: 100, unit: '%',
    basis:
      'Published oxygen saturation floor for dogs breathing room air, as measured by a clinical ' +
      'pulse oximeter on thin tissue (ear, lip or tongue). Reference range, not a MaraPet measurement.'
  };

  // hrv_ms and activity have NO published band for dogs that MaraPet can stand
  // behind, so none is offered. A trend is still shown; a pass/fail judgement
  // is not, because there is nothing honest to compare against.
  return out;
}

/** 'low' | 'ok' | 'high' | null when no band exists for that metric. */
function classify(metric, value, bands) {
  const b = bands && bands[metric];
  if (!b) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (b.min !== undefined && v < b.min) return 'low';
  if (b.max !== undefined && v > b.max) return 'high';
  return 'ok';
}

module.exports = { SIZES, sizeFromWeight, ageMonths, forPet, classify };
