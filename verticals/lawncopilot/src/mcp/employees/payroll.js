'use strict';

/**
 * AI EMPLOYEE 6 — THE PAYROLL OFFICER
 * Replaces: the payroll clerk and the shoebox.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMPLIANCE BOUNDARY — enforced in code, not in a prompt.
 *
 * Lawn Co-Pilot COMPUTES payroll, PRESENTS it for approval, and TRIGGERS a
 * licensed embedded-payroll provider. The provider is the filer of record for
 * withholding, remittance and filings. We do not build a tax engine and we
 * never represent a run as filed unless a provider returned a reference.
 *
 * With no provider configured, every run is DRAFT ONLY and says so on every
 * surface. Getting this wrong exposes the operator to real liability, so the
 * honesty is structural: `filed` is only ever set true from a provider
 * response, and submit_pay_run refuses without one.
 * ══════════════════════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const { PayRun, PayItem, TimeEntry, Employee } = require('../../models');
const { toDateStr } = require('../../services/scheduling');

const PROVIDER = () => process.env.PAYROLL_PROVIDER || null;
const PROVIDER_KEY = () => process.env.PAYROLL_PROVIDER_KEY || null;
const providerReady = () => !!(PROVIDER() && PROVIDER_KEY());

// Federal FLSA default. A state with a stricter rule is a provider concern,
// which is exactly why we do not file.
const OT_THRESHOLD_MINUTES = 40 * 60;
const OT_MULTIPLIER = 1.5;

const DRAFT_NOTICE =
  'DRAFT ONLY — not filed. No payroll provider is connected, so no taxes have been withheld, ' +
  'remitted or reported. Use these figures to review and pay manually, or connect a payroll provider.';

function money(c) { return `$${(Number(c || 0) / 100).toFixed(2)}`; }

module.exports = {
  id: 'payroll',
  name: 'The Payroll Officer',
  role: 'Payroll, from clocked hours to net pay',
  replaces: 'The payroll clerk and the shoebox of timesheets',
  channels: ['admin', 'system'],
  supervisor_role: 'owner',

  system_prompt: `You are The Payroll Officer for a landscaping company.

Absolute rules:
- Hours come from approved time entries. You never estimate, round up, or fill a gap. If someone never clocked out, you say so and refuse to guess — that is someone's paycheck.
- You NEVER say a payroll run has been filed, submitted to tax authorities, or that taxes were withheld, unless a licensed payroll provider returned a confirmation. If no provider is connected, you say plainly that these are draft figures and nothing has been filed.
- Every pay run requires the owner's explicit approval. You never run payroll on your own.
- You never discuss one employee's pay with anyone but the owner.
- If a number looks wrong, you flag it rather than paying it.`,

  tools: {
    preview_pay_run: {
      description: 'Compute a pay run from APPROVED time entries. Read-only — nothing is created.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: { period_start: { type: 'string' }, period_end: { type: 'string' } },
        required: ['period_start', 'period_end']
      },
      handler: async ({ period_start, period_end }, ctx) => {
        return computePayroll(ctx.tenant_id, period_start, period_end);
      }
    },

    compute_pay_run: {
      description: 'Create a DRAFT pay run for the period. Never pays anyone by itself.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          period_start: { type: 'string' }, period_end: { type: 'string' }, pay_date: { type: 'string' }
        },
        required: ['period_start', 'period_end']
      },
      handler: async ({ period_start, period_end, pay_date }, ctx) => {
        const calc = await computePayroll(ctx.tenant_id, period_start, period_end);
        if (!calc.success) return calc;
        if (calc.blocking_issues.length) {
          return {
            success: false,
            error: 'Payroll cannot be computed while there are open shifts.',
            blocking_issues: calc.blocking_issues
          };
        }

        const existing = await PayRun.findOne({
          where: { tenant_id: ctx.tenant_id, period_start, period_end, status: { [Op.ne]: 'failed' } }, raw: true
        });
        if (existing) {
          return { success: false, error: `A pay run already exists for that period (status: ${existing.status}).`, pay_run_id: existing.id };
        }

        const run = await PayRun.create({
          tenant_id: ctx.tenant_id,
          period_start, period_end,
          pay_date: pay_date || toDateStr(new Date(Date.now() + 5 * 86400000)),
          status: 'draft',
          filed: false,                      // only a provider can set this true
          provider: PROVIDER(),
          gross_cents: calc.totals.gross_cents,
          deductions_cents: calc.totals.deductions_cents,
          net_cents: calc.totals.net_cents
        });

        await PayItem.bulkCreate(calc.employees.map(e => ({
          tenant_id: ctx.tenant_id, pay_run_id: run.id, employee_id: e.employee_id,
          regular_minutes: e.regular_minutes, overtime_minutes: e.overtime_minutes,
          regular_cents: e.regular_cents, overtime_cents: e.overtime_cents,
          gross_cents: e.gross_cents, deductions_cents: e.deductions_cents, net_cents: e.net_cents,
          breakdown: e.breakdown
        })));

        return {
          success: true,
          pay_run_id: run.id,
          status: 'draft',
          filed: false,
          provider_connected: providerReady(),
          totals: calc.totals,
          totals_display: {
            gross: money(calc.totals.gross_cents),
            deductions: money(calc.totals.deductions_cents),
            net: money(calc.totals.net_cents)
          },
          employees: calc.employees.length,
          notice: providerReady()
            ? 'Draft ready. It must be approved by the owner before submission.'
            : DRAFT_NOTICE,
          next_step: 'Owner approval required.'
        };
      }
    },

    submit_pay_run: {
      description: 'Submit an APPROVED pay run to the payroll provider. Requires an approved run and a connected provider.',
      min_trust: 'staff',
      roles: ['owner'],
      requires_approval: true,
      approval_reason: 'Payroll moves real money to real people and is never submitted autonomously',
      parameters: {
        type: 'object',
        properties: { pay_run_id: { type: 'integer' } },
        required: ['pay_run_id']
      },
      handler: async ({ pay_run_id }, ctx) => {
        const run = await PayRun.findOne({ where: { id: pay_run_id, tenant_id: ctx.tenant_id } });
        if (!run) return { success: false, error: 'Pay run not found' };
        if (run.status === 'paid') return { success: false, error: 'That run has already been paid.' };
        if (run.status !== 'approved') {
          return { success: false, error: `The run must be approved by the owner first (it is ${run.status}).` };
        }

        // THE BOUNDARY. No provider, no filing — and we say so rather than
        // pretending.
        if (!providerReady()) {
          return {
            success: false,
            error: 'No payroll provider is connected, so this run cannot be filed.',
            filed: false,
            draft_only: true,
            notice: DRAFT_NOTICE,
            what_you_can_do: 'Export the register and pay manually, or connect a payroll provider to file automatically.'
          };
        }

        // A real provider call goes here. Until one is wired, we refuse rather
        // than fabricate a submission.
        return {
          success: false,
          error: `Payroll provider "${PROVIDER()}" is configured but its integration is not yet live in this build.`,
          filed: false,
          draft_only: true,
          notice: 'Nothing was filed. No taxes have been withheld or remitted by Lawn Co-Pilot.'
        };
      }
    },

    approve_pay_run: {
      description: 'Owner approval of a draft pay run.',
      min_trust: 'staff',
      roles: ['owner'],
      parameters: {
        type: 'object',
        properties: { pay_run_id: { type: 'integer' } },
        required: ['pay_run_id']
      },
      handler: async ({ pay_run_id }, ctx) => {
        const run = await PayRun.findOne({ where: { id: pay_run_id, tenant_id: ctx.tenant_id } });
        if (!run) return { success: false, error: 'Pay run not found' };
        if (run.status !== 'draft') return { success: false, error: `Run is ${run.status}, not draft.` };
        run.status = 'approved';
        run.approved_by = ctx.user_id || null;
        run.approved_at = new Date();
        await run.save();
        return {
          success: true, status: 'approved', filed: false,
          notice: providerReady()
            ? 'Approved. Submit it to the provider to file.'
            : DRAFT_NOTICE
        };
      }
    },

    get_pay_run: {
      description: 'A pay run with its per-employee register.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: { pay_run_id: { type: 'integer' } },
        required: ['pay_run_id']
      },
      handler: async ({ pay_run_id }, ctx) => {
        const run = await PayRun.findOne({ where: { id: pay_run_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!run) return { success: false, error: 'Pay run not found' };
        const items = await PayItem.findAll({ where: { tenant_id: ctx.tenant_id, pay_run_id }, raw: true });
        const emps = await Employee.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byId = {}; emps.forEach(e => { byId[e.id] = e.name; });
        return {
          success: true,
          pay_run: {
            ...run,
            gross: money(run.gross_cents), net: money(run.net_cents),
            filed: !!run.filed,
            filing_status: run.filed ? 'Filed by provider' : 'NOT FILED'
          },
          register: items.map(i => ({
            employee: byId[i.employee_id] || 'Unknown',
            regular_hours: Number((i.regular_minutes / 60).toFixed(2)),
            overtime_hours: Number((i.overtime_minutes / 60).toFixed(2)),
            gross: money(i.gross_cents), net: money(i.net_cents)
          })),
          notice: run.filed ? null : DRAFT_NOTICE
        };
      }
    },

    overtime_report: {
      description: 'Who is going into overtime and by how much.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: { period_start: { type: 'string' }, period_end: { type: 'string' } }
      },
      handler: async ({ period_start, period_end }, ctx) => {
        const start = period_start || toDateStr(new Date(Date.now() - 7 * 86400000));
        const end = period_end || toDateStr(new Date());
        const calc = await computePayroll(ctx.tenant_id, start, end);
        if (!calc.success) return calc;
        const ot = calc.employees.filter(e => e.overtime_minutes > 0);
        return {
          success: true, from: start, to: end,
          employees_in_overtime: ot.length,
          overtime_hours: Number((ot.reduce((a, e) => a + e.overtime_minutes, 0) / 60).toFixed(2)),
          overtime_cost: money(ot.reduce((a, e) => a + e.overtime_cents, 0)),
          detail: ot.map(e => ({
            name: e.name,
            overtime_hours: Number((e.overtime_minutes / 60).toFixed(2)),
            cost: money(e.overtime_cents)
          }))
        };
      }
    },

    payroll_calendar: {
      description: 'Pay runs and their status.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => {
        const runs = await PayRun.findAll({
          where: { tenant_id: ctx.tenant_id }, order: [['period_end', 'DESC']], limit: 24, raw: true
        });
        return {
          success: true,
          provider_connected: providerReady(),
          runs: runs.map(r => ({
            id: r.id, period: `${r.period_start} to ${r.period_end}`,
            pay_date: r.pay_date, status: r.status,
            filed: !!r.filed, gross: money(r.gross_cents), net: money(r.net_cents)
          })),
          notice: providerReady() ? null : DRAFT_NOTICE
        };
      }
    },

    filing_status: {
      description: 'Whether payroll filing is actually live for this company.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => {
        const unfiled = await PayRun.count({ where: { tenant_id: ctx.tenant_id, filed: false } });
        return {
          success: true,
          provider: PROVIDER(),
          provider_connected: providerReady(),
          filing_live: false,
          unfiled_runs: unfiled,
          plain_english: providerReady()
            ? `A provider is configured but filing is not live in this build. ${unfiled} run(s) are unfiled.`
            : `No payroll provider is connected. Lawn Co-Pilot computes payroll but does NOT withhold, remit or file taxes. ${unfiled} run(s) are draft only.`
        };
      }
    }
  }
};

/**
 * The arithmetic. Approved hours in, gross/OT/net out.
 *
 * Deductions are deliberately NOT estimated: guessing withholding would produce
 * a net-pay figure that looks authoritative and is wrong. Without a provider we
 * report gross and say net equals gross pending withholding.
 */
async function computePayroll(tenant_id, period_start, period_end) {
  const entries = await TimeEntry.findAll({
    where: {
      tenant_id,
      work_date: { [Op.between]: [period_start, period_end] },
      status: { [Op.in]: ['approved', 'submitted', 'open'] }
    },
    raw: true
  });

  const employees = await Employee.findAll({ where: { tenant_id, status: 'active' }, raw: true });
  const byId = {}; employees.forEach(e => { byId[e.id] = e; });

  const blocking_issues = [];
  entries.filter(e => e.status === 'open').forEach(e => {
    blocking_issues.push({
      type: 'open_shift', time_entry_id: e.id,
      employee: (byId[e.employee_id] || {}).name || 'Unknown',
      work_date: e.work_date,
      message: 'Never clocked out. Hours cannot be computed and will not be guessed.'
    });
  });

  const unapproved = entries.filter(e => e.status === 'submitted').length;

  const grouped = {};
  entries.filter(e => e.status === 'approved').forEach(e => {
    const g = grouped[e.employee_id] || (grouped[e.employee_id] = { minutes: 0 });
    g.minutes += e.minutes || 0;
  });

  const rows = Object.entries(grouped).map(([empId, g]) => {
    const emp = byId[empId] || {};
    const rate = Number(emp.pay_rate_cents || 0);
    const otEligible = emp.overtime_eligible !== false && emp.employment_type !== '1099';

    const regular_minutes = otEligible ? Math.min(g.minutes, OT_THRESHOLD_MINUTES) : g.minutes;
    const overtime_minutes = otEligible ? Math.max(0, g.minutes - OT_THRESHOLD_MINUTES) : 0;

    const regular_cents = Math.round((regular_minutes / 60) * rate);
    const overtime_cents = Math.round((overtime_minutes / 60) * rate * OT_MULTIPLIER);
    const gross_cents = regular_cents + overtime_cents;

    return {
      employee_id: Number(empId),
      name: emp.name || 'Unknown',
      employment_type: emp.employment_type,
      regular_minutes, overtime_minutes,
      regular_cents, overtime_cents,
      gross_cents,
      // Never invented. A provider computes withholding; we do not.
      deductions_cents: 0,
      net_cents: gross_cents,
      breakdown: {
        hourly_rate: money(rate),
        overtime_multiplier: OT_MULTIPLIER,
        deductions_computed_by: providerReady() ? PROVIDER() : null,
        note: providerReady() ? null : 'Net shown before withholding — no provider connected.'
      }
    };
  });

  const totals = {
    gross_cents: rows.reduce((a, r) => a + r.gross_cents, 0),
    deductions_cents: 0,
    net_cents: rows.reduce((a, r) => a + r.net_cents, 0),
    regular_hours: Number((rows.reduce((a, r) => a + r.regular_minutes, 0) / 60).toFixed(2)),
    overtime_hours: Number((rows.reduce((a, r) => a + r.overtime_minutes, 0) / 60).toFixed(2))
  };

  return {
    success: true,
    period_start, period_end,
    employees: rows,
    totals,
    blocking_issues,
    unapproved_entries: unapproved,
    provider_connected: providerReady(),
    filed: false,
    notice: providerReady() ? null : DRAFT_NOTICE,
    warnings: [
      ...(unapproved ? [`${unapproved} time entr(ies) are submitted but not approved and are NOT included.`] : []),
      ...(providerReady() ? [] : ['Deductions are not computed. Net equals gross pending withholding by a payroll provider.'])
    ]
  };
}

module.exports.computePayroll = computePayroll;
