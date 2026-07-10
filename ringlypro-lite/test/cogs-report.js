'use strict';
/**
 * Per-minute COGS report on a synthetic 10-call batch (acceptance test).
 * Honest: the v1 ConversationRelay path is expected to EXCEED $0.06/min; the
 * report also prints the projected unbundled path (under target). No DB needed.
 */
const { callCost, callCostUnbundled, TARGET_PER_MIN } = require('../src/utils/cost');

// 10 calls: mix of US/CO, message/appointment, 45-105s.
const batch = [
  { country: 'US', duration: 62, disposition: 'message', in: 2600, out: 180 },
  { country: 'US', duration: 78, disposition: 'appointment', in: 3400, out: 240 },
  { country: 'US', duration: 51, disposition: 'message', in: 2100, out: 150 },
  { country: 'US', duration: 88, disposition: 'appointment', in: 3900, out: 260 },
  { country: 'US', duration: 45, disposition: 'message', in: 1800, out: 120 },
  { country: 'US', duration: 73, disposition: 'appointment', in: 3200, out: 220 },
  { country: 'CO', duration: 84, disposition: 'appointment', in: 3600, out: 250 },
  { country: 'CO', duration: 66, disposition: 'message', in: 2500, out: 170 },
  { country: 'CO', duration: 95, disposition: 'appointment', in: 4100, out: 280 },
  { country: 'CO', duration: 58, disposition: 'message', in: 2300, out: 160 }
];
function smsSeg(d) { return d === 'appointment' ? 2 : d === 'message' ? 1 : 0; }

const target = TARGET_PER_MIN();
const agg = { all: z(), US: z(), CO: z() };
function z() { return { cost: 0, min: 0, unb: 0 }; }
console.log('RinglyPro Lite — COGS report (v1 ConversationRelay)  target $%s/min\n', target.toFixed(2));
console.log('#   ctry  disp         sec   min    voice     sms      llm      total     $/min');
batch.forEach((c, i) => {
  const call = { duration: c.duration, country: c.country, llm_input_tokens: c.in, llm_output_tokens: c.out };
  const k = callCost(call, smsSeg(c.disposition));
  const u = callCostUnbundled(call, smsSeg(c.disposition));
  for (const g of ['all', c.country]) { agg[g].cost += k.total; agg[g].min += k.minutes; agg[g].unb += u.total; }
  console.log(
    `${String(i + 1).padStart(2)}  ${c.country}    ${c.disposition.padEnd(11)} ${String(c.duration).padStart(3)}  ${k.minutes.toFixed(2)}  ${k.voice.toFixed(4)}  ${k.sms.toFixed(4)}  ${k.llm.toFixed(4)}  ${k.total.toFixed(4)}  ${k.perMinute.toFixed(4)}`
  );
});
function line(label, g) {
  const v1 = g.min ? g.cost / g.min : 0;
  const ub = g.min ? g.unb / g.min : 0;
  console.log(`${label.padEnd(10)} v1 $${v1.toFixed(4)}/min ${v1 <= target ? '<= target ✓' : '> target ✗'}   |   unbundled $${ub.toFixed(4)}/min ${ub <= target ? '<= target ✓' : '> target ✗'}`);
}
console.log('\n— Per-minute COGS by geography (' + agg.all.min.toFixed(2) + ' min over ' + batch.length + ' calls) —');
line('ALL', agg.all);
line('US', agg.US);
line('COLOMBIA', agg.CO);
console.log('\nFINDING:');
console.log(' - US: v1 ConversationRelay EXCEEDS $0.06 (~$0.093/min); the unbundled path lands UNDER target.');
console.log(' - Colombia: EXCEEDS on both paths — driven by CO local inbound ($0.0945/min) + CO SMS ($0.06/seg).');
console.log('   Fix = Telnyx/mobile origination + WhatsApp-instead-of-SMS (see docs/telephony-costs.md). FLAGGED, not auto-applied.');
