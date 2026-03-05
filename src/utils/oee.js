/**
 * Calculate OEE and its three sub-components.
 * All time inputs in minutes. Cycle times in seconds.
 *
 * @param {Object} params
 * @param {number} params.plannedTime         - Total planned production time (min)
 * @param {number} params.downtime            - Total downtime during shift (min)
 * @param {number} params.idealCycleTimeSec   - Machine's expected cycle time (sec)
 * @param {number} params.totalParts          - Total parts produced
 * @param {number} params.goodParts           - Good (non-defective) parts
 * @returns {Object} { availability, performance, quality, oee } — all as percentages
 */
function calculateOEE({ plannedTime, downtime, idealCycleTimeSec, totalParts, goodParts }) {
  const operatingTime = plannedTime - downtime;

  const availability = plannedTime > 0 ? operatingTime / plannedTime : 0;
  const performance = operatingTime > 0
    ? ((idealCycleTimeSec / 60) * totalParts) / operatingTime
    : 0;
  const quality = totalParts > 0 ? goodParts / totalParts : 0;
  const oee = availability * performance * quality;

  return {
    availability: +(availability * 100).toFixed(1),
    performance:  +(Math.min(performance, 1) * 100).toFixed(1), // cap at 100%
    quality:      +(quality * 100).toFixed(1),
    oee:          +(oee * 100).toFixed(1),
    operatingTime: +operatingTime.toFixed(1),
    downtime:     +downtime.toFixed(1)
  };
}

module.exports = { calculateOEE };
