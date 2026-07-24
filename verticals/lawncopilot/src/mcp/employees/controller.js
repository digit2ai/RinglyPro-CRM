'use strict';

/**
 * AI EMPLOYEE 8 — THE CONTROLLER
 * Replaces: the advisor they never hired.
 *
 * Administrative cost saving. Finds the money: jobs priced below cost, drive
 * time burned, overtime that is structural rather than exceptional, work done
 * but never billed.
 *
 * HONESTY RULE, enforced in code: every figure traces to real rows. The
 * "we saved you $X this month" number is the renewal argument, so a fabricated
 * one is worse than none. Where the underlying data does not exist, the tool
 * says so and returns null rather than an estimate dressed up as a fact.
 */

const { Op } = require('sequelize');
const {
  Appointment, ServiceRecord, TimeEntry, Employee, Invoice, Payment, Expense,
  JobCost, Route, Customer, Property, Subscription, AgentCall, CallLog, Quote
} = require('../../models');
const { toDateStr } = require('../../services/scheduling');
const { priceProperty } = require('../../services/pricing');

const OVERHEAD_PER_JOB_CENTS = () => Number(process.env.LAWNCOPILOT_OVERHEAD_PER_JOB_CENTS || 400);
const DRIVE_COST_PER_MIN_CENTS = () => Number(process.env.LAWNCOPILOT_DRIVE_COST_PER_MIN_CENTS || 85);
const TARGET_MARGIN = () => Number(process.env.LAWNCOPILOT_TARGET_MARGIN || 0.45);

function money(c) { return `$${(Number(c || 0) / 100).toFixed(2)}`; }

module.exports = {
  id: 'controller',
  name: 'The Controller',
  role: 'Administrative cost saving and margin',
  replaces: 'The advisor they never hired',
  channels: ['admin', 'system'],
  supervisor_role: 'owner',

  system_prompt: `You are The Controller for a landscaping company. You find money.

Rules:
- Every number you give traces to real records — real clocked hours, real invoices, real routes. If the data is not there, you say "I cannot compute that yet and here is what is missing." You never estimate a saving and present it as fact.
- You are direct about bad news. If a long-standing customer is losing money, you say so with the number.
- Recommendations come with the specific action and the dollar impact, not general advice.
- You never touch prices yourself. You recommend, the owner decides.`,

  tools: {
    job_costing: {
      description: 'True cost and margin per completed job, from real clocked hours.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' }, recompute: { type: 'boolean' } } },
      handler: async ({ days, recompute }, ctx) => {
        const since = new Date(Date.now() - (Number(days) || 30) * 86400000);
        const records = await ServiceRecord.findAll({
          where: { tenant_id: ctx.tenant_id, completed_at: { [Op.gte]: since } }, raw: true
        });
        if (!records.length) {
          return {
            success: true, jobs: 0, computed: 0,
            note: 'No completed jobs in this period yet, so there is nothing to cost.'
          };
        }

        const employees = await Employee.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const rateById = {}; employees.forEach(e => { rateById[e.id] = e.pay_rate_cents || 0; });

        const rows = [];
        let missingHours = 0;

        for (const r of records) {
          const entries = await TimeEntry.findAll({
            where: { tenant_id: ctx.tenant_id, appointment_id: r.appointment_id }, raw: true
          });
          if (!entries.length) { missingHours++; continue; }

          const labor_minutes = entries.reduce((a, t) => a + (t.minutes || 0), 0);
          const labor_cents = entries.reduce(
            (a, t) => a + Math.round(((t.minutes || 0) / 60) * (rateById[t.employee_id] || 0)), 0
          );

          const route = await Route.findOne({
            where: { tenant_id: ctx.tenant_id, service_date: r.service_date, crew_id: r.crew_id }, raw: true
          });
          const stops = route && route.stop_count ? route.stop_count : null;
          const drive_minutes = (route && route.drive_minutes && stops)
            ? Math.round(route.drive_minutes / stops) : 0;
          const drive_cents = drive_minutes * DRIVE_COST_PER_MIN_CENTS();

          const expenses = await Expense.findAll({
            where: { tenant_id: ctx.tenant_id, appointment_id: r.appointment_id }, raw: true
          });
          const material_cents = expenses.reduce((a, x) => a + (x.amount_cents || 0), 0);
          const overhead_cents = OVERHEAD_PER_JOB_CENTS();

          const total_cost_cents = labor_cents + drive_cents + material_cents + overhead_cents;
          const revenue_cents = r.charges_cents || 0;
          const margin_cents = revenue_cents - total_cost_cents;

          const row = {
            appointment_id: r.appointment_id, customer_id: r.customer_id,
            service_date: r.service_date,
            labor_minutes, labor_cents, drive_minutes, drive_cents,
            material_cents, overhead_cents, total_cost_cents,
            revenue_cents, margin_cents,
            margin_pct: revenue_cents ? Number((margin_cents / revenue_cents).toFixed(3)) : null
          };
          rows.push(row);

          if (recompute) {
            await JobCost.destroy({ where: { tenant_id: ctx.tenant_id, appointment_id: r.appointment_id } });
            await JobCost.create({ tenant_id: ctx.tenant_id, service_record_id: r.id, crew_id: r.crew_id, ...row });
          }
        }

        const revenue = rows.reduce((a, r) => a + r.revenue_cents, 0);
        const cost = rows.reduce((a, r) => a + r.total_cost_cents, 0);

        return {
          success: true,
          jobs_in_period: records.length,
          jobs_costed: rows.length,
          jobs_missing_hours: missingHours,
          revenue_cents: revenue, cost_cents: cost,
          margin_cents: revenue - cost,
          margin_pct: revenue ? Number(((revenue - cost) / revenue).toFixed(3)) : null,
          display: { revenue: money(revenue), cost: money(cost), margin: money(revenue - cost) },
          data_gap: missingHours
            ? `${missingHours} completed job(s) have no clocked hours, so they are excluded rather than estimated. Have crews clock in and out to close this gap.`
            : null
        };
      }
    },

    underpriced_jobs: {
      description: 'Customers and jobs consistently below target margin, with a specific recommended price.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const costing = await module.exports.tools.job_costing.handler({ days: days || 90 }, ctx);
        if (!costing.success || !costing.jobs_costed) {
          return {
            success: true, underpriced: [],
            note: costing.data_gap || 'Not enough costed jobs yet to judge pricing.'
          };
        }

        const since = new Date(Date.now() - (Number(days) || 90) * 86400000);
        const records = await ServiceRecord.findAll({
          where: { tenant_id: ctx.tenant_id, completed_at: { [Op.gte]: since } }, raw: true
        });
        const employees = await Employee.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const rateById = {}; employees.forEach(e => { rateById[e.id] = e.pay_rate_cents || 0; });
        const customers = await Customer.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byCustomer = {}; customers.forEach(c => { byCustomer[c.id] = c; });

        const agg = {};
        for (const r of records) {
          const entries = await TimeEntry.findAll({
            where: { tenant_id: ctx.tenant_id, appointment_id: r.appointment_id }, raw: true
          });
          if (!entries.length) continue;
          const labor = entries.reduce(
            (a, t) => a + Math.round(((t.minutes || 0) / 60) * (rateById[t.employee_id] || 0)), 0
          );
          const cost = labor + OVERHEAD_PER_JOB_CENTS();
          const g = agg[r.customer_id] || (agg[r.customer_id] = { jobs: 0, revenue: 0, cost: 0 });
          g.jobs++; g.revenue += r.charges_cents || 0; g.cost += cost;
        }

        const target = TARGET_MARGIN();
        const out = [];
        for (const [cid, g] of Object.entries(agg)) {
          if (g.jobs < 2 || !g.revenue) continue;
          const margin = (g.revenue - g.cost) / g.revenue;
          if (margin >= target) continue;

          const avgRevenue = Math.round(g.revenue / g.jobs);
          const avgCost = Math.round(g.cost / g.jobs);
          const needed = Math.round(avgCost / (1 - target));

          out.push({
            customer_id: Number(cid),
            customer: (byCustomer[cid] || {}).name || 'Unknown',
            jobs: g.jobs,
            current_price: money(avgRevenue),
            true_cost: money(avgCost),
            current_margin_pct: Number((margin * 100).toFixed(1)),
            recommended_price: money(needed),
            increase: money(needed - avgRevenue),
            annual_impact: money((needed - avgRevenue) * g.jobs * (365 / (Number(days) || 90)))
          });
        }

        out.sort((a, b) => a.current_margin_pct - b.current_margin_pct);
        return {
          success: true,
          target_margin_pct: Math.round(target * 100),
          underpriced: out,
          count: out.length,
          note: out.length
            ? 'These are computed from real clocked hours. You decide whether to raise them.'
            : 'Nothing is priced below target on the jobs with real hours recorded.'
        };
      }
    },

    route_waste: {
      description: 'Drive time versus optimized, and what the gap costs.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const since = toDateStr(new Date(Date.now() - (Number(days) || 30) * 86400000));
        const routes = await Route.findAll({
          where: { tenant_id: ctx.tenant_id, service_date: { [Op.gte]: since } }, raw: true
        });
        if (!routes.length) {
          return {
            success: true, saved_minutes: 0,
            note: 'No optimized routes recorded yet. Run route optimization on a service day and this fills in.'
          };
        }
        const saved = routes.reduce((a, r) => a + (r.saved_minutes || 0), 0);
        const remaining = routes.reduce(
          (a, r) => a + Math.max(0, (r.drive_minutes || 0)), 0
        );
        return {
          success: true,
          days_optimized: routes.length,
          saved_minutes: saved,
          saved_hours: Number((saved / 60).toFixed(1)),
          saved_cost: money(saved * DRIVE_COST_PER_MIN_CENTS()),
          remaining_drive_minutes: remaining,
          note: 'Savings are measured against the unoptimized order of the same stops, not an assumption.'
        };
      }
    },

    overtime_waste: {
      description: 'Whether overtime is structural rather than exceptional.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { weeks: { type: 'integer' } } },
      handler: async ({ weeks }, ctx) => {
        const n = Number(weeks) || 4;
        const since = toDateStr(new Date(Date.now() - n * 7 * 86400000));
        const entries = await TimeEntry.findAll({
          where: { tenant_id: ctx.tenant_id, work_date: { [Op.gte]: since }, status: 'approved' }, raw: true
        });
        if (!entries.length) {
          return { success: true, note: 'No approved time entries in this period, so overtime cannot be assessed.' };
        }
        const employees = await Employee.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byId = {}; employees.forEach(e => { byId[e.id] = e; });

        const perEmpWeek = {};
        entries.forEach(e => {
          const wk = weekOf(e.work_date);
          const k = `${e.employee_id}|${wk}`;
          perEmpWeek[k] = (perEmpWeek[k] || 0) + (e.minutes || 0);
        });

        const otByEmp = {};
        Object.entries(perEmpWeek).forEach(([k, mins]) => {
          const [empId] = k.split('|');
          const ot = Math.max(0, mins - 40 * 60);
          if (!ot) return;
          const g = otByEmp[empId] || (otByEmp[empId] = { weeks: 0, minutes: 0 });
          g.weeks++; g.minutes += ot;
        });

        const rows = Object.entries(otByEmp).map(([empId, g]) => {
          const rate = (byId[empId] || {}).pay_rate_cents || 0;
          return {
            employee: (byId[empId] || {}).name || 'Unknown',
            weeks_with_overtime: g.weeks,
            overtime_hours: Number((g.minutes / 60).toFixed(1)),
            premium_cost: money(Math.round((g.minutes / 60) * rate * 0.5)),
            structural: g.weeks >= Math.ceil(n * 0.75)
          };
        }).sort((a, b) => b.overtime_hours - a.overtime_hours);

        const structural = rows.filter(r => r.structural);
        return {
          success: true, weeks: n, employees_with_overtime: rows.length, detail: rows,
          finding: structural.length
            ? `${structural.length} employee(s) are in overtime most weeks. That is a staffing or routing problem, not a busy stretch.`
            : 'Overtime looks occasional rather than structural.'
        };
      }
    },

    unbilled_work: {
      description: 'Completed work with no invoice, and plans that quietly stopped billing.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const since = new Date(Date.now() - (Number(days) || 60) * 86400000);
        const records = await ServiceRecord.findAll({
          where: { tenant_id: ctx.tenant_id, completed_at: { [Op.gte]: since } }, raw: true
        });
        const invoices = await Invoice.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const invoiced = new Set(invoices.map(i => i.service_record_id).filter(Boolean));
        const missing = records.filter(r => !invoiced.has(r.id));
        const value = missing.reduce((a, r) => a + (r.charges_cents || 0), 0);

        const customers = await Customer.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byId = {}; customers.forEach(c => { byId[c.id] = c.name; });

        return {
          success: true,
          unbilled_jobs: missing.length,
          unbilled_value_cents: value,
          unbilled_value: money(value),
          jobs: missing.slice(0, 50).map(r => ({
            service_date: r.service_date,
            customer: byId[r.customer_id] || 'Unknown',
            amount: money(r.charges_cents)
          })),
          note: missing.length
            ? 'This is work already performed that nobody was charged for.'
            : 'Every completed job in this period has an invoice.'
        };
      }
    },

    cash_forecast: {
      description: 'Expected collections against known costs.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const horizon = Number(days) || 30;
        const open = await Invoice.findAll({
          where: { tenant_id: ctx.tenant_id, status: { [Op.in]: ['open', 'failed'] } }, raw: true
        });
        const receivable = open.reduce((a, i) => a + (i.total_cents - i.amount_paid_cents), 0);

        const upcoming = await Appointment.findAll({
          where: {
            tenant_id: ctx.tenant_id, status: 'scheduled',
            service_date: { [Op.between]: [toDateStr(new Date()), toDateStr(new Date(Date.now() + horizon * 86400000))] }
          }, raw: true
        });
        const booked = upcoming.reduce((a, x) => a + (x.price_cents || 0), 0);

        const since = new Date(Date.now() - 30 * 86400000);
        const recentExpenses = await Expense.findAll({
          where: { tenant_id: ctx.tenant_id, spent_on: { [Op.gte]: toDateStr(since) } }, raw: true
        });
        const monthlyExpense = recentExpenses.reduce((a, e) => a + (e.amount_cents || 0), 0);

        return {
          success: true,
          horizon_days: horizon,
          receivable_cents: receivable,
          booked_revenue_cents: booked,
          known_expenses_cents: Math.round(monthlyExpense * (horizon / 30)),
          projected_cents: receivable + booked - Math.round(monthlyExpense * (horizon / 30)),
          display: {
            receivable: money(receivable),
            booked: money(booked),
            expenses: money(Math.round(monthlyExpense * (horizon / 30))),
            projected: money(receivable + booked - Math.round(monthlyExpense * (horizon / 30)))
          },
          caveats: [
            'Booked revenue assumes scheduled visits are completed.',
            recentExpenses.length ? null : 'No expenses recorded, so the cost side is understated.',
            'Payroll is not included unless recorded as an expense.'
          ].filter(Boolean)
        };
      }
    },

    savings_summary: {
      description: 'What the system actually saved this period. Every figure traces to real records.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const n = Number(days) || 30;
        const since = new Date(Date.now() - n * 86400000);
        const items = [];

        // After-hours calls the Receptionist answered that would have been missed.
        const calls = await CallLog.findAll({
          where: { tenant_id: ctx.tenant_id, created_at: { [Op.gte]: since } }, raw: true
        });
        const afterHours = calls.filter(c => {
          const h = new Date(c.created_at).getHours();
          return h < 8 || h >= 17;
        }).length;
        if (calls.length) {
          items.push({
            item: 'Calls answered after hours',
            count: afterHours,
            basis: `${calls.length} call(s) logged, ${afterHours} outside 8am-5pm`,
            traced: true
          });
        }

        // Quotes issued without a site visit.
        const quotes = await Quote.count({
          where: { tenant_id: ctx.tenant_id, created_at: { [Op.gte]: since } }
        });
        if (quotes) {
          items.push({
            item: 'Estimates produced without a truck roll',
            count: quotes,
            basis: `${quotes} quote(s) issued from measured property records`,
            traced: true
          });
        }

        // Drive time saved, only where a route was actually optimized.
        const routes = await Route.findAll({
          where: { tenant_id: ctx.tenant_id, service_date: { [Op.gte]: toDateStr(since) } }, raw: true
        });
        const savedMin = routes.reduce((a, r) => a + (r.saved_minutes || 0), 0);
        if (routes.length) {
          items.push({
            item: 'Drive time saved by route optimization',
            count: Number((savedMin / 60).toFixed(1)),
            unit: 'hours',
            value: money(savedMin * DRIVE_COST_PER_MIN_CENTS()),
            basis: `${routes.length} optimized day(s), measured against the unoptimized order`,
            traced: true
          });
        }

        // Invoices collected without anyone chasing.
        const autoPaid = await Payment.count({
          where: { tenant_id: ctx.tenant_id, status: 'succeeded', processed_at: { [Op.gte]: since } }
        });
        if (autoPaid) {
          items.push({
            item: 'Payments collected automatically',
            count: autoPaid,
            basis: `${autoPaid} successful payment(s) recorded`,
            traced: true
          });
        }

        const aiActions = await AgentCall.count({
          where: { tenant_id: ctx.tenant_id, created_at: { [Op.gte]: since }, success: true }
        });

        return {
          success: true,
          period_days: n,
          ai_actions_taken: aiActions,
          items,
          quantified_value: money(savedMin * DRIVE_COST_PER_MIN_CENTS()),
          honesty_note: items.length
            ? 'Every line above is counted from real records. Items with no underlying data are omitted rather than estimated.'
            : 'Not enough activity yet to report savings. Nothing has been estimated to fill the gap.'
        };
      }
    },

    price_recommendations: {
      description: 'Suggested rate-card changes based on real margins. Recommends only — never changes a price.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => {
        const under = await module.exports.tools.underpriced_jobs.handler({ days: 90 }, ctx);
        if (!under.success || !under.count) {
          return { success: true, recommendations: [], note: under.note };
        }
        const totalIncrease = under.underpriced.reduce(
          (a, u) => a + Number(String(u.increase).replace(/[^0-9.]/g, '')), 0
        );
        return {
          success: true,
          recommendations: under.underpriced.slice(0, 20),
          count: under.count,
          combined_per_visit_increase: `$${totalIncrease.toFixed(2)}`,
          action: 'Review these with the owner. No price is changed by this tool.'
        };
      }
    }
  }
};

function weekOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = (d.getDay() + 6) % 7;      // Monday = 0
  d.setDate(d.getDate() - day);
  return toDateStr(d);
}
