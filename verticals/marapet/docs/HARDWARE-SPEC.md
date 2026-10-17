# MaraPet — hardware specification for ISTC

**ISTC × Digit2AI.** ISTC owns the device: board, sensors, firmware, enclosure,
battery, certification, and the decision to manufacture or to source. Digit2AI
owns the app, the cloud, the ingest contract and the AI. This document is what
Digit2AI owes ISTC's engineering lead: the exact contract the platform will
accept, and what is and is not physically measurable where.

Written 2026-10-17. Everything below that is a measurement or a vendor fact is
cited. **Everything not cited is marked as not established, because an engineer
will order parts against this page.**

---

## 1. The firmware target

The platform is device-agnostic by construction. Any board that can make this
request works, today, with no change on our side.

```
POST https://marapet.app/api/v1/readings
Authorization: Bearer mp_dev_<24 random bytes, base64url>
Content-Type: application/json

{
  "recorded_at": "2026-10-17T03:12:00.000Z",
  "firmware": "1.0.3",
  "metrics": { "heart_rate_bpm": 78, "resp_rate_bpm": 22, "activity": 14 }
}
```

Buffered form, which is what a collar sends when it comes back into range:

```json
{ "samples": [
    { "metric": "heart_rate_bpm", "value": 78, "recorded_at": "2026-10-17T03:12:00.000Z" },
    { "metric": "heart_rate_bpm", "value": 81, "recorded_at": "2026-10-17T03:14:00.000Z" } ] }
```

| Rule | Detail |
|---|---|
| **Base URL** | Configuration, never a literal compiled into firmware. A board that cannot follow a domain move is a board that has to be reflashed. |
| **Auth** | One bearer key per device. It can WRITE and read nothing. Hashed at rest, shown once at pairing. |
| **Metrics accepted** | `heart_rate_bpm`, `resp_rate_bpm`, `hrv_ms`, `activity`, `temp_c`, `spo2_pct` |
| **Anything else** | Comes back in `rejected`, **named**. A metric we silently discarded would look like success from the device side. |
| **Idempotency** | Keyed on device + instant + metric. A retry after a dropped connection cannot double-count, so firmware may retry freely. |
| **Batch ceiling** | 500 samples per request, 256 KB body. |
| **Clock** | `GET /api/v1/ingest/ping` returns server time. A sample more than 10 minutes in the future is refused as a wrong clock; up to 90 days in the past is accepted as a buffer flush. |
| **Rate** | 120 requests per minute per device by default (`MARAPET_INGEST_PER_MIN`). |
| **Revocation** | The owner can revoke a key from the app; the next request gets 401. Firmware should surface that state rather than retrying forever. |

Suggested cadence, which the platform does not enforce: a stored sample every
2 minutes while resting, matching what comparable products do, and a flush
whenever the link is up.

---

## 2. What is measurable, where, and what is not

### Heart rate, respiratory rate, HRV, activity — at the neck, by movement

This is the proven path and is what every shipping competitor does.

- Fur defeats optical (PPG) and electrical (ECG) sensing at the collar site. The
  reference product states this directly: *"due to their fur, non-invasive
  optical or electrical sensors are not feasible for use on dogs"*, which is why
  its collar is accelerometer-based.
  — Invoxia, *Assessing the accuracy of the Invoxia smart dog collar*
- A 703-dog, ~189-day cohort using such a collar is published, so the method has
  real-world support rather than only a vendor claim.
  — *Resting heart and respiratory rates in dogs in their natural environment*
    (AI-COLLAR study), Frontiers in Veterinary Science, 2025.
    https://pmc.ncbi.nlm.nih.gov/articles/PMC12477687
- Accuracy figures published by collar vendors are **theirs**, about **their**
  device. MaraPet publishes none and must not quote one.

**Implication for the board:** a low-noise 3-axis accelerometer at the ventral
neck, sampled continuously, with the cardiac and respiratory components
extracted on-device. Everything else in this list is secondary to getting that
one signal clean.

### Oxygen saturation — NOT at the neck

Transmittance pulse oximetry needs thin, sparsely furred, well-perfused tissue.
Veterinary pulse oximeters clip to the **ear pinna, lip or tongue** for exactly
that reason. A collar cannot read it.

`spo2_pct` is already in the ingest allow-list so that an ear-site accessory is
a configuration change rather than a platform change. Until a row exists the app
draws no oxygen card at all — an empty card reads as a broken feature, an absent
one reads as a feature this device does not have.

**Not established:** whether a continuous ear-worn oximeter is practical on an
awake dog. A clip is a spot check, and a dog will shake at it. Treat it as a
guided measurement the owner takes, not a trend line.

### Blood pressure — a cuff, not a wearable

Canine blood pressure is oscillometric or Doppler, with a cuff on a limb or the
tail base. There is no wearable path. It is **deliberately absent from the data
model**, not present and empty. If ISTC ever ships a cuff it enters as a
timestamped manual reading, never as a continuous trend.

### Temperature — skin, not core

A collar thermistor reads skin and ambient, not core. Useful as a trend,
misleading against a rectal reference range. `temp_c` is accepted and the app
labels it skin temperature.

---

## 3. Build or buy — what is settled and what is not

**Settled:** nothing in the platform depends on this choice. An ISTC board, an
ODM module and a hand-typed number are the same shape at the ingest door.

**Not established, and needing ISTC's own sourcing work before any number is
quoted:** BOM cost, MOQ, lead time, and the certification burden per market.
No figure is given here because none has been verified, and a guessed BOM is
worse than a blank one.

The questions worth answering first, in order:

1. **Can the accelerometer signal chain be bought as a module?** The hard part
   is not the radio or the battery, it is a clean enough accelerometer signal at
   the neck of a moving animal. If an ODM already solves that, buying it is the
   cheap answer; if not, in-house is the only answer.
2. **Battery life against sampling rate.** Continuous accelerometer sampling is
   the whole power budget. Decide the target in days before choosing the cell.
3. **Radio.** BLE to the owner's phone is the low-cost path and means readings
   arrive only when the phone is near. Cellular removes that constraint and adds
   a recurring cost per device. This is a product decision, not an engineering
   one, and it changes the pricing model.
4. **Certification per market.** US, Colombia and Venezuela differ. A pilot can
   run uncertified in a way a sale cannot, and that distinction should be made
   explicitly rather than discovered.

---

## 4. What the platform will never ask the device to do

- Decide whether a reading is normal. Bands live on the server and depend on the
  dog's size and age, which the device does not know.
- Send a diagnosis, a condition, or any judgement. It sends numbers.
- Send its own `source` label. A device key may only write `source: "device"`;
  it cannot mark its reading as a human-entered figure or a video estimate.

---

## 5. The open validation item

The in-app breathing estimate from video has **not** been validated against a
vet counting breaths with a stopwatch. It is labelled an estimate everywhere it
appears, with its confidence. That study is cheap, it is the only thing that
turns an estimate into a measurement, and it should be arranged before the
figure is used to market anything.

`scripts/calibrate-breathing.js` measures the estimator's false-alarm and
recovery rates against synthetic signals, which is a different and lesser claim:
it shows the detector behaves, not that it is right about a dog.
