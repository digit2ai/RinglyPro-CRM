/**
 * RinglyPro Neural Engine
 *
 * Analyzes calls, appointments, contacts, messages, and CRM activity
 * to generate actionable intelligence insights for business owners.
 */

const { QueryTypes } = require('sequelize');

class NeuralEngine {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  // ─── HELPER ──────────────────────────────────────────────────
  today() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  // ─── 1. MISSED REVENUE DETECTOR ─────────────────────────────
  async analyzeMissedRevenue(clientId, days = 7) {
    const since = this.daysAgo(days);
    const [missed] = await this.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM calls
       WHERE client_id = :clientId
         AND call_status IN ('missed','no-answer')
         AND direction = 'incoming'
         AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );
    const [total] = await this.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM calls
       WHERE client_id = :clientId
         AND direction = 'incoming'
         AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );
    const missedCount = parseInt(missed.cnt) || 0;
    const totalCount = parseInt(total.cnt) || 0;
    if (missedCount === 0) return null;

    const estimatedLostBookings = Math.round(missedCount * 0.35);
    const missRate = totalCount > 0 ? ((missedCount / totalCount) * 100).toFixed(1) : 0;

    return {
      category: 'missed_revenue',
      title: `${missedCount} Missed Calls This Week`,
      summary: `You missed ${missedCount} incoming calls in the last ${days} days (${missRate}% miss rate). This may represent ${estimatedLostBookings} lost bookings.`,
      evidence: { missedCount, totalIncoming: totalCount, missRate: parseFloat(missRate), days },
      impact: missedCount > 20 ? 'critical' : missedCount > 10 ? 'high' : 'medium',
      impactEstimate: `${estimatedLostBookings} estimated lost bookings`,
      recommendedAction: missedCount > 15
        ? 'Enable after-hours AI answering to capture calls outside business hours. Review peak missed-call times and adjust staffing.'
        : 'Review missed call times and consider enabling voicemail-to-text with auto-callback.'
    };
  }

  // ─── 2. CALL CONVERSION INTELLIGENCE ────────────────────────
  async analyzeCallConversion(clientId, days = 30) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         CASE WHEN c.duration >= 90 THEN 'long' ELSE 'short' END AS bucket,
         COUNT(DISTINCT c.id) AS call_count,
         COUNT(DISTINCT a.id) AS booking_count
       FROM calls c
       LEFT JOIN appointments a
         ON a.client_id = c.client_id
         AND a.customer_phone = c.from_number
         AND a.created_at BETWEEN c.created_at AND c.created_at + INTERVAL '24 hours'
       WHERE c.client_id = :clientId
         AND c.direction = 'incoming'
         AND c.call_status = 'completed'
         AND c.created_at >= :since
       GROUP BY bucket`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const long = rows.find(r => r.bucket === 'long') || { call_count: 0, booking_count: 0 };
    const short = rows.find(r => r.bucket === 'short') || { call_count: 0, booking_count: 0 };
    const longRate = long.call_count > 0 ? (long.booking_count / long.call_count) : 0;
    const shortRate = short.call_count > 0 ? (short.booking_count / short.call_count) : 0;
    const multiplier = shortRate > 0 ? (longRate / shortRate).toFixed(1) : 'N/A';

    if (parseInt(long.call_count) + parseInt(short.call_count) < 5) return null;

    return {
      category: 'call_conversion',
      title: 'Call Duration Drives Bookings',
      summary: `Calls longer than 90 seconds convert at ${(longRate * 100).toFixed(1)}% vs ${(shortRate * 100).toFixed(1)}% for shorter calls (${multiplier}× difference).`,
      evidence: {
        longCalls: parseInt(long.call_count), longBookings: parseInt(long.booking_count), longRate: (longRate * 100).toFixed(1),
        shortCalls: parseInt(short.call_count), shortBookings: parseInt(short.booking_count), shortRate: (shortRate * 100).toFixed(1),
        multiplier, days
      },
      impact: parseFloat(multiplier) > 2 ? 'high' : 'medium',
      impactEstimate: `${multiplier}× higher conversion for longer calls`,
      recommendedAction: 'Train AI voice agents to extend call engagement. Ensure agents ask discovery questions before offering appointment times.'
    };
  }

  // ─── 3. LEAD RESPONSE SPEED MONITOR ─────────────────────────
  async analyzeLeadResponseSpeed(clientId, days = 14) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         c.id AS contact_id,
         c.created_at AS lead_created,
         MIN(cl.created_at) AS first_call,
         MIN(m.created_at) AS first_sms
       FROM contacts c
       LEFT JOIN calls cl ON cl.contact_id = c.id AND cl.direction = 'outgoing'
       LEFT JOIN messages m ON m.contact_id = c.id AND m.direction = 'outbound'
       WHERE c.client_id = :clientId
         AND c.created_at >= :since
       GROUP BY c.id, c.created_at`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    if (rows.length < 3) return null;

    let fast = 0, slow = 0, noResponse = 0;
    for (const r of rows) {
      const firstTouch = r.first_call || r.first_sms;
      if (!firstTouch) { noResponse++; continue; }
      const diffMin = (new Date(firstTouch) - new Date(r.lead_created)) / 60000;
      if (diffMin <= 5) fast++;
      else slow++;
    }

    if (noResponse + slow === 0) return null;

    return {
      category: 'lead_response',
      title: 'Lead Response Speed Needs Improvement',
      summary: `${noResponse} leads received no follow-up and ${slow} leads waited more than 5 minutes for a response. Leads contacted within 5 minutes convert up to 35% more often.`,
      evidence: { totalLeads: rows.length, fastResponse: fast, slowResponse: slow, noResponse, days },
      impact: noResponse > 5 ? 'critical' : slow > fast ? 'high' : 'medium',
      impactEstimate: `${noResponse + slow} leads with delayed or missing follow-up`,
      recommendedAction: 'Enable auto-callback within 2 minutes of lead creation. Configure SMS auto-responder for new contacts.'
    };
  }

  // ─── 4. SCHEDULING OPTIMIZATION ─────────────────────────────
  async analyzeScheduling(clientId, days = 14) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         EXTRACT(DOW FROM appointment_date::date) AS dow,
         TO_CHAR(appointment_date::date, 'Day') AS day_name,
         COUNT(*) AS cnt
       FROM appointments
       WHERE client_id = :clientId
         AND appointment_date >= :since
         AND status NOT IN ('cancelled')
       GROUP BY dow, day_name
       ORDER BY dow`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    if (rows.length < 2) return null;

    const avg = rows.reduce((s, r) => s + parseInt(r.cnt), 0) / 7;
    const underbooked = rows.filter(r => parseInt(r.cnt) < avg * 0.6);
    const busiest = rows.reduce((a, b) => parseInt(a.cnt) > parseInt(b.cnt) ? a : b);

    if (underbooked.length === 0) return null;

    const underbookedNames = underbooked.map(r => r.day_name.trim()).join(', ');
    const gap = avg > 0 ? Math.round((1 - (parseInt(underbooked[0]?.cnt || 0) / avg)) * 100) : 0;

    return {
      category: 'scheduling',
      title: `${underbookedNames} Underbooked`,
      summary: `${underbookedNames} are underbooked by up to ${gap}% compared to your busiest day (${busiest.day_name.trim()}).`,
      evidence: { distribution: rows.map(r => ({ day: r.day_name.trim(), count: parseInt(r.cnt) })), average: Math.round(avg), gap, days },
      impact: gap > 50 ? 'high' : 'medium',
      impactEstimate: `${gap}% scheduling gap on ${underbookedNames}`,
      recommendedAction: `Offer promotional pricing or priority availability on ${underbookedNames} to fill scheduling gaps.`
    };
  }

  // ─── 5. VOICE CONVERSATION INSIGHTS ─────────────────────────
  async analyzeVoiceConversations(clientId, days = 7) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE duration < 30) AS very_short,
         COUNT(*) FILTER (WHERE duration BETWEEN 30 AND 60) AS short,
         COUNT(*) FILTER (WHERE duration BETWEEN 60 AND 180) AS medium,
         COUNT(*) FILTER (WHERE duration > 180) AS long,
         AVG(duration) AS avg_duration,
         COUNT(*) FILTER (WHERE call_status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE call_status IN ('missed','no-answer')) AS missed
       FROM calls
       WHERE client_id = :clientId
         AND direction = 'incoming'
         AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const r = rows[0];
    if (!r || parseInt(r.total) < 3) return null;

    const veryShortPct = ((parseInt(r.very_short) / parseInt(r.total)) * 100).toFixed(1);

    return {
      category: 'voice_conversation',
      title: 'Voice Interaction Patterns Detected',
      summary: `${veryShortPct}% of calls end within 30 seconds — these callers may be hanging up before the AI agent engages. Average call duration is ${Math.round(r.avg_duration || 0)} seconds.`,
      evidence: {
        total: parseInt(r.total),
        veryShort: parseInt(r.very_short),
        short: parseInt(r.short),
        medium: parseInt(r.medium),
        long: parseInt(r.long),
        avgDuration: Math.round(r.avg_duration || 0),
        veryShortPct: parseFloat(veryShortPct),
        days
      },
      impact: parseFloat(veryShortPct) > 30 ? 'high' : 'medium',
      impactEstimate: `${r.very_short} calls ended before meaningful engagement`,
      recommendedAction: 'Improve the AI agent greeting — make it faster and more engaging. Consider reducing the initial response delay.'
    };
  }

  // ─── 6. LEAD SOURCE INTELLIGENCE ────────────────────────────
  async analyzeLeadSources(clientId, days = 30) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         c.source,
         COUNT(DISTINCT c.id) AS lead_count,
         COUNT(DISTINCT a.id) AS booking_count
       FROM contacts c
       LEFT JOIN appointments a
         ON a.contact_id = c.id
         AND a.status NOT IN ('cancelled')
         AND a.created_at >= :since
       WHERE c.client_id = :clientId
         AND c.created_at >= :since
         AND c.source IS NOT NULL
       GROUP BY c.source
       ORDER BY booking_count DESC`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    if (rows.length < 2) return null;

    const sources = rows.map(r => ({
      source: r.source,
      leads: parseInt(r.lead_count),
      bookings: parseInt(r.booking_count),
      conversionRate: parseInt(r.lead_count) > 0 ? ((parseInt(r.booking_count) / parseInt(r.lead_count)) * 100).toFixed(1) : '0.0'
    }));

    const best = sources[0];
    const worst = sources[sources.length - 1];
    const multiplier = parseFloat(worst.conversionRate) > 0 ? (parseFloat(best.conversionRate) / parseFloat(worst.conversionRate)).toFixed(1) : 'N/A';

    return {
      category: 'lead_source',
      title: `${best.source} Leads Convert Best`,
      summary: `${best.source} leads convert at ${best.conversionRate}% — ${multiplier}× better than ${worst.source} (${worst.conversionRate}%).`,
      evidence: { sources, bestSource: best.source, worstSource: worst.source, multiplier, days },
      impact: 'medium',
      impactEstimate: `${multiplier}× conversion gap between sources`,
      recommendedAction: `Increase investment in ${best.source} lead generation. Review ${worst.source} lead quality and targeting.`
    };
  }

  // ─── 7. OUTBOUND CAMPAIGN PERFORMANCE ───────────────────────
  async analyzeOutboundCampaigns(clientId, days = 14) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         EXTRACT(HOUR FROM created_at) AS hour,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE call_status = 'completed' AND duration > 10) AS answered
       FROM calls
       WHERE client_id = :clientId
         AND direction = 'outgoing'
         AND created_at >= :since
       GROUP BY hour
       ORDER BY hour`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    if (rows.length < 2) return null;

    const hourData = rows.map(r => ({
      hour: parseInt(r.hour),
      total: parseInt(r.total),
      answered: parseInt(r.answered),
      answerRate: parseInt(r.total) > 0 ? ((parseInt(r.answered) / parseInt(r.total)) * 100).toFixed(1) : '0.0'
    }));

    const bestHour = hourData.reduce((a, b) => parseFloat(a.answerRate) > parseFloat(b.answerRate) ? a : b);
    const totalOutbound = hourData.reduce((s, h) => s + h.total, 0);
    const totalAnswered = hourData.reduce((s, h) => s + h.answered, 0);
    const overallRate = totalOutbound > 0 ? ((totalAnswered / totalOutbound) * 100).toFixed(1) : '0.0';

    return {
      category: 'outbound_campaign',
      title: 'Outbound Call Timing Matters',
      summary: `Outbound calls at ${bestHour.hour > 12 ? bestHour.hour - 12 : bestHour.hour}${bestHour.hour >= 12 ? 'PM' : 'AM'} have the highest answer rate (${bestHour.answerRate}%). Overall answer rate: ${overallRate}%.`,
      evidence: { hourlyBreakdown: hourData, bestHour: bestHour.hour, bestRate: bestHour.answerRate, overallRate, totalOutbound, totalAnswered, days },
      impact: parseFloat(overallRate) < 30 ? 'high' : 'medium',
      impactEstimate: `${bestHour.answerRate}% peak answer rate at ${bestHour.hour > 12 ? bestHour.hour - 12 : bestHour.hour}${bestHour.hour >= 12 ? 'PM' : 'AM'}`,
      recommendedAction: `Concentrate outbound calling between ${bestHour.hour}:00 and ${bestHour.hour + 2}:00 for maximum answer rates.`
    };
  }

  // ─── 8. NO-SHOW PATTERN DETECTION ──────────────────────────
  async analyzeNoShows(clientId, days = 30) {
    const since = this.daysAgo(days);
    const [stats] = await this.sequelize.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'no-show') AS no_shows,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
       FROM appointments
       WHERE client_id = :clientId
         AND appointment_date >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const total = parseInt(stats.total) || 0;
    const noShows = parseInt(stats.no_shows) || 0;
    if (noShows < 2) return null;

    const noShowRate = ((noShows / total) * 100).toFixed(1);

    return {
      category: 'customer_sentiment',
      title: `${noShowRate}% No-Show Rate Detected`,
      summary: `${noShows} of ${total} appointments were no-shows in the last ${days} days. Each no-show is a lost revenue opportunity and wastes schedule capacity.`,
      evidence: { total, noShows, completed: parseInt(stats.completed), cancelled: parseInt(stats.cancelled), noShowRate: parseFloat(noShowRate), days },
      impact: parseFloat(noShowRate) > 20 ? 'critical' : parseFloat(noShowRate) > 10 ? 'high' : 'medium',
      impactEstimate: `${noShows} wasted appointment slots`,
      recommendedAction: 'Enable automated appointment reminders via SMS 24 hours and 1 hour before the appointment. Consider requiring deposits for high-value services.'
    };
  }

  // ─── 9. REVENUE OPPORTUNITY FORECAST ────────────────────────
  async analyzeRevenueForecast(clientId, days = 30) {
    const since = this.daysAgo(days);
    const [callData] = await this.sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE direction = 'incoming' AND call_status = 'completed') AS answered,
         COUNT(*) FILTER (WHERE direction = 'incoming') AS total_incoming
       FROM calls
       WHERE client_id = :clientId AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );
    const [apptData] = await this.sequelize.query(
      `SELECT COUNT(*) AS bookings
       FROM appointments
       WHERE client_id = :clientId AND created_at >= :since AND status NOT IN ('cancelled')`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const answered = parseInt(callData.answered) || 0;
    const totalIncoming = parseInt(callData.total_incoming) || 0;
    const bookings = parseInt(apptData.bookings) || 0;

    if (answered < 5) return null;

    const currentConvRate = answered > 0 ? (bookings / answered) : 0;
    const targetConvRate = Math.min(currentConvRate * 1.25, 0.6); // 25% improvement cap at 60%
    const additionalBookings = Math.round((targetConvRate - currentConvRate) * answered);
    const currentPct = (currentConvRate * 100).toFixed(0);
    const targetPct = (targetConvRate * 100).toFixed(0);

    if (additionalBookings < 1) return null;

    return {
      category: 'revenue_forecast',
      title: `+${additionalBookings} Bookings Opportunity`,
      summary: `Improving call-to-booking conversion from ${currentPct}% to ${targetPct}% could generate ${additionalBookings} additional bookings per month.`,
      evidence: { answered, totalIncoming, bookings, currentConvRate: parseFloat(currentPct), targetConvRate: parseFloat(targetPct), additionalBookings, days },
      impact: additionalBookings > 10 ? 'critical' : additionalBookings > 5 ? 'high' : 'medium',
      impactEstimate: `${additionalBookings} additional bookings per month`,
      recommendedAction: 'Focus on improving AI agent scripts, reducing response time, and following up on missed calls within 5 minutes.'
    };
  }

  // ─── 10. AFTER-HOURS CALL ANALYSIS ──────────────────────────
  async analyzeAfterHoursCalls(clientId, days = 14) {
    const since = this.daysAgo(days);
    const rows = await this.sequelize.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM created_at) < 9 OR EXTRACT(HOUR FROM created_at) >= 18) AS after_hours,
         COUNT(*) FILTER (WHERE (EXTRACT(HOUR FROM created_at) < 9 OR EXTRACT(HOUR FROM created_at) >= 18)
           AND call_status IN ('missed','no-answer')) AS after_hours_missed
       FROM calls
       WHERE client_id = :clientId
         AND direction = 'incoming'
         AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const r = rows[0];
    const afterHours = parseInt(r.after_hours) || 0;
    const afterHoursMissed = parseInt(r.after_hours_missed) || 0;
    if (afterHours < 3) return null;

    const afterHoursPct = ((afterHours / parseInt(r.total)) * 100).toFixed(1);

    return {
      category: 'script_optimization',
      title: `${afterHoursPct}% of Calls Are After-Hours`,
      summary: `${afterHours} calls came in outside business hours (before 9 AM or after 6 PM), and ${afterHoursMissed} of those were missed. These represent untapped booking potential.`,
      evidence: { total: parseInt(r.total), afterHours, afterHoursMissed, afterHoursPct: parseFloat(afterHoursPct), days },
      impact: afterHoursMissed > 10 ? 'high' : 'medium',
      impactEstimate: `${afterHoursMissed} missed after-hours calls`,
      recommendedAction: 'Ensure the AI voice agent is active 24/7 with after-hours booking capability. Configure SMS auto-reply for calls that go to voicemail.'
    };
  }

  // ─── FULL ANALYSIS PIPELINE ─────────────────────────────────
  async runFullAnalysis(clientId) {
    const analysisDate = this.today();
    const analyzers = [
      () => this.analyzeMissedRevenue(clientId),
      () => this.analyzeCallConversion(clientId),
      () => this.analyzeLeadResponseSpeed(clientId),
      () => this.analyzeScheduling(clientId),
      () => this.analyzeVoiceConversations(clientId),
      () => this.analyzeLeadSources(clientId),
      () => this.analyzeOutboundCampaigns(clientId),
      () => this.analyzeNoShows(clientId),
      () => this.analyzeRevenueForecast(clientId),
      () => this.analyzeAfterHoursCalls(clientId)
    ];

    const results = await Promise.allSettled(analyzers.map(fn => fn()));

    const insights = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => ({ ...r.value, analysisDate, clientId }));

    // Sort by impact priority
    const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    insights.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

    return {
      clientId,
      analysisDate,
      insightCount: insights.length,
      insights
    };
  }

  // ─── OVERVIEW METRICS ───────────────────────────────────────
  async getOverviewMetrics(clientId, days = 7) {
    const since = this.daysAgo(days);
    const prevSince = this.daysAgo(days * 2);

    const [current] = await this.sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE direction = 'incoming') AS total_calls,
         COUNT(*) FILTER (WHERE direction = 'incoming' AND call_status IN ('missed','no-answer')) AS missed_calls,
         COUNT(*) FILTER (WHERE direction = 'incoming' AND call_status = 'completed') AS answered_calls,
         AVG(CASE WHEN call_status = 'completed' THEN duration END) AS avg_duration,
         COUNT(*) FILTER (WHERE direction = 'outgoing') AS outbound_calls
       FROM calls
       WHERE client_id = :clientId AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const [previous] = await this.sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE direction = 'incoming') AS total_calls,
         COUNT(*) FILTER (WHERE direction = 'incoming' AND call_status IN ('missed','no-answer')) AS missed_calls
       FROM calls
       WHERE client_id = :clientId AND created_at >= :prevSince AND created_at < :since`,
      { replacements: { clientId, prevSince, since }, type: QueryTypes.SELECT }
    );

    const [appts] = await this.sequelize.query(
      `SELECT
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'no-show') AS no_shows
       FROM appointments
       WHERE client_id = :clientId AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const [contacts] = await this.sequelize.query(
      `SELECT COUNT(*) AS new_leads FROM contacts
       WHERE client_id = :clientId AND created_at >= :since`,
      { replacements: { clientId, since }, type: QueryTypes.SELECT }
    );

    const totalCalls = parseInt(current.total_calls) || 0;
    const missedCalls = parseInt(current.missed_calls) || 0;
    const answeredCalls = parseInt(current.answered_calls) || 0;
    const prevTotal = parseInt(previous.total_calls) || 0;
    const prevMissed = parseInt(previous.missed_calls) || 0;

    const answerRate = totalCalls > 0 ? (((totalCalls - missedCalls) / totalCalls) * 100).toFixed(1) : '0.0';
    const prevAnswerRate = prevTotal > 0 ? (((prevTotal - prevMissed) / prevTotal) * 100).toFixed(1) : '0.0';
    const bookings = parseInt(appts.total_bookings) || 0;
    const conversionRate = answeredCalls > 0 ? ((bookings / answeredCalls) * 100).toFixed(1) : '0.0';

    return {
      period: `${days} days`,
      calls: {
        total: totalCalls,
        answered: answeredCalls,
        missed: missedCalls,
        outbound: parseInt(current.outbound_calls) || 0,
        answerRate: parseFloat(answerRate),
        prevAnswerRate: parseFloat(prevAnswerRate),
        answerRateTrend: parseFloat(answerRate) - parseFloat(prevAnswerRate),
        avgDuration: Math.round(current.avg_duration || 0)
      },
      bookings: {
        total: bookings,
        completed: parseInt(appts.completed) || 0,
        noShows: parseInt(appts.no_shows) || 0,
        conversionRate: parseFloat(conversionRate)
      },
      leads: {
        newLeads: parseInt(contacts.new_leads) || 0
      }
    };
  }
}

module.exports = NeuralEngine;
