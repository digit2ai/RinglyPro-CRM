'use strict';

/**
 * AI EMPLOYEE 5 — THE CREW MANAGER
 * Replaces: the clipboard, the group chat, the HR folder in the truck.
 *
 * Owns people. Employees, crews, certifications that expire, availability,
 * and the single source of hours — clock in and out — which flows straight
 * into payroll with no re-entry, ever.
 */

const { Op } = require('sequelize');
const {
  Employee, Certification, Availability, TimeEntry, JobChecklist,
  Crew, Appointment, Property, ServiceRecord
} = require('../../models');
const { toDateStr } = require('../../services/scheduling');

function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
}

// Rough distance in metres, for the clock-in geofence.
function metresBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = d => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = {
  id: 'crew',
  name: 'The Crew Manager',
  role: 'People, hours and job execution',
  replaces: 'The clipboard, the group chat, and the HR folder in the truck',
  channels: ['admin', 'portal', 'system', 'phone'],
  supervisor_role: 'admin',

  system_prompt: `You are The Crew Manager for a landscaping company. You look after the people.

Rules:
- Hours are facts, not estimates. They come from clock-in and clock-out records. You never invent, round up, or "estimate" someone's time, because those numbers become someone's paycheck.
- A missing clock-out is a problem to flag, not a gap to fill with a guess.
- Certifications that expire are a legal risk. You warn early and clearly.
- You never discuss one employee's pay with another employee.
- Terminations, discipline and pay changes go to the owner. You prepare, a human decides.`,

  tools: {
    add_employee: {
      description: 'Add an employee or subcontractor to the company.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
          crew_id: { type: 'integer' }, role: { type: 'string' },
          employment_type: { type: 'string', enum: ['w2', '1099'] },
          pay_type: { type: 'string', enum: ['hourly', 'salary', 'per_job'] },
          pay_rate_cents: { type: 'integer' }, hire_date: { type: 'string' }
        },
        required: ['name']
      },
      handler: async (args, ctx) => {
        if (!args.name || String(args.name).trim().length < 2) {
          return { success: false, error: 'A name is required.' };
        }
        const emp = await Employee.create({
          tenant_id: ctx.tenant_id,
          name: String(args.name).trim(),
          email: args.email || null, phone: args.phone || null,
          crew_id: args.crew_id || null,
          role: args.role || 'crew',
          employment_type: args.employment_type || 'w2',
          pay_type: args.pay_type || 'hourly',
          pay_rate_cents: args.pay_rate_cents || 0,
          hire_date: args.hire_date || null,
          status: 'active'
        });
        return { success: true, employee_id: emp.id, name: emp.name };
      }
    },

    list_employees: {
      description: 'List employees with crew, pay type and status.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher'],
      parameters: { type: 'object', properties: { status: { type: 'string' } } },
      handler: async ({ status }, ctx) => {
        const where = { tenant_id: ctx.tenant_id };
        if (status) where.status = status;
        const rows = await Employee.findAll({ where, order: [['name', 'ASC']], raw: true });
        const crews = await Crew.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byCrew = {}; crews.forEach(c => { byCrew[c.id] = c.name; });
        return {
          success: true, count: rows.length,
          employees: rows.map(r => ({
            id: r.id, name: r.name, role: r.role, crew: byCrew[r.crew_id] || null,
            employment_type: r.employment_type, pay_type: r.pay_type,
            pay_rate: `$${(r.pay_rate_cents / 100).toFixed(2)}`, status: r.status
          }))
        };
      }
    },

    clock_in: {
      description: 'Clock an employee onto a job. This is the start of a real payroll record.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher', 'tech'],
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'integer' }, appointment_id: { type: 'integer' },
          lat: { type: 'number' }, lng: { type: 'number' }
        },
        required: ['employee_id']
      },
      handler: async ({ employee_id, appointment_id, lat, lng }, ctx) => {
        const emp = await Employee.findOne({ where: { id: employee_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!emp) return { success: false, error: 'Employee not found' };

        const open = await TimeEntry.findOne({
          where: { tenant_id: ctx.tenant_id, employee_id, status: 'open' }, raw: true
        });
        if (open) {
          return { success: false, error: `${emp.name} is already clocked in. Clock out first.`, time_entry_id: open.id };
        }

        // Geofence is informational, never a blocker — a crew standing at the
        // curb with bad GPS must still be able to start work.
        let geofence_ok = null;
        if (appointment_id && lat && lng) {
          const appt = await Appointment.findOne({ where: { id: appointment_id, tenant_id: ctx.tenant_id }, raw: true });
          if (appt && appt.property_id) {
            const p = await Property.findOne({ where: { id: appt.property_id, tenant_id: ctx.tenant_id }, raw: true });
            if (p && p.lat && p.lng) geofence_ok = metresBetween(lat, lng, p.lat, p.lng) <= 250;
          }
        }

        const entry = await TimeEntry.create({
          tenant_id: ctx.tenant_id, employee_id, appointment_id: appointment_id || null,
          crew_id: emp.crew_id || null,
          work_date: toDateStr(new Date()),
          clock_in: new Date(),
          clock_in_geo: (lat && lng) ? { lat, lng } : null,
          geofence_ok, status: 'open'
        });
        return {
          success: true, time_entry_id: entry.id, employee: emp.name,
          clocked_in_at: entry.clock_in,
          note: geofence_ok === false ? 'Clocked in away from the job site — flagged for review.' : null
        };
      }
    },

    clock_out: {
      description: 'Clock an employee off. Computes real worked minutes.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher', 'tech'],
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'integer' }, break_minutes: { type: 'integer' },
          lat: { type: 'number' }, lng: { type: 'number' }, notes: { type: 'string' }
        },
        required: ['employee_id']
      },
      handler: async ({ employee_id, break_minutes, lat, lng, notes }, ctx) => {
        const entry = await TimeEntry.findOne({
          where: { tenant_id: ctx.tenant_id, employee_id, status: 'open' },
          order: [['id', 'DESC']]
        });
        if (!entry) return { success: false, error: 'No open shift for that employee.' };

        entry.clock_out = new Date();
        entry.break_minutes = Math.max(0, Number(break_minutes) || 0);
        entry.minutes = Math.max(0, minutesBetween(entry.clock_in, entry.clock_out) - entry.break_minutes);
        entry.clock_out_geo = (lat && lng) ? { lat, lng } : null;
        entry.notes = notes || entry.notes;
        entry.status = 'submitted';
        await entry.save();

        return {
          success: true, time_entry_id: entry.id,
          minutes: entry.minutes,
          hours: Number((entry.minutes / 60).toFixed(2)),
          status: 'submitted for approval'
        };
      }
    },

    timesheet: {
      description: 'Timesheet for a period, by employee, with approval state.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' }, to: { type: 'string' }, employee_id: { type: 'integer' }
        }
      },
      handler: async ({ from, to, employee_id }, ctx) => {
        const start = from || toDateStr(new Date(Date.now() - 14 * 86400000));
        const end = to || toDateStr(new Date());
        const where = {
          tenant_id: ctx.tenant_id,
          work_date: { [Op.between]: [start, end] }
        };
        if (employee_id) where.employee_id = employee_id;

        const entries = await TimeEntry.findAll({ where, order: [['work_date', 'ASC']], raw: true });
        const emps = await Employee.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byId = {}; emps.forEach(e => { byId[e.id] = e; });

        const grouped = {};
        entries.forEach(e => {
          const g = grouped[e.employee_id] || (grouped[e.employee_id] = {
            employee_id: e.employee_id,
            name: (byId[e.employee_id] || {}).name || 'Unknown',
            minutes: 0, entries: 0, open: 0, unapproved: 0
          });
          g.minutes += e.minutes || 0;
          g.entries++;
          if (e.status === 'open') g.open++;
          if (e.status === 'submitted') g.unapproved++;
        });

        const rows = Object.values(grouped).map(g => ({
          ...g, hours: Number((g.minutes / 60).toFixed(2))
        }));
        const openShifts = rows.reduce((a, r) => a + r.open, 0);

        return {
          success: true, from: start, to: end,
          employees: rows,
          total_hours: Number((rows.reduce((a, r) => a + r.minutes, 0) / 60).toFixed(2)),
          open_shifts: openShifts,
          warning: openShifts
            ? `${openShifts} shift(s) never clocked out. Fix those before running payroll — do not guess the hours.`
            : null
        };
      }
    },

    approve_time: {
      description: 'Approve submitted time entries so they can be paid.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: { entry_ids: { type: 'array', items: { type: 'integer' } }, from: { type: 'string' }, to: { type: 'string' } }
      },
      handler: async ({ entry_ids, from, to }, ctx) => {
        const where = { tenant_id: ctx.tenant_id, status: 'submitted' };
        if (entry_ids && entry_ids.length) where.id = entry_ids;
        else if (from && to) where.work_date = { [Op.between]: [from, to] };
        else return { success: false, error: 'Give entry ids or a date range.' };

        const [n] = await TimeEntry.update(
          { status: 'approved', approved_by: ctx.user_id || null, approved_at: new Date() },
          { where }
        );
        return { success: true, approved: n };
      }
    },

    assign_certification: {
      description: 'Record a license or certification with its expiry.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'integer' }, kind: { type: 'string' }, name: { type: 'string' },
          number: { type: 'string' }, issued_on: { type: 'string' }, expires_on: { type: 'string' }
        },
        required: ['employee_id', 'name']
      },
      handler: async (args, ctx) => {
        const c = await Certification.create({ tenant_id: ctx.tenant_id, ...args });
        return { success: true, certification_id: c.id };
      }
    },

    expiring_certifications: {
      description: 'Licenses and certifications expiring soon or already expired.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const horizon = toDateStr(new Date(Date.now() + (Number(days) || 60) * 86400000));
        const rows = await Certification.findAll({
          where: { tenant_id: ctx.tenant_id, expires_on: { [Op.lte]: horizon } },
          order: [['expires_on', 'ASC']], raw: true
        });
        const emps = await Employee.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const byId = {}; emps.forEach(e => { byId[e.id] = e.name; });
        const today = toDateStr(new Date());
        return {
          success: true,
          count: rows.length,
          items: rows.map(r => ({
            employee: byId[r.employee_id] || 'Unknown',
            name: r.name, kind: r.kind, expires_on: r.expires_on,
            expired: r.expires_on < today
          })),
          expired_count: rows.filter(r => r.expires_on < today).length
        };
      }
    },

    set_availability: {
      description: 'Set working hours or record time off for an employee.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher'],
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'integer' }, kind: { type: 'string' },
          days: { type: 'array', items: { type: 'integer' } },
          start_time: { type: 'string' }, end_time: { type: 'string' },
          from_date: { type: 'string' }, to_date: { type: 'string' }, reason: { type: 'string' }
        },
        required: ['employee_id']
      },
      handler: async (args, ctx) => {
        const row = await Availability.create({ tenant_id: ctx.tenant_id, ...args });
        return { success: true, availability_id: row.id };
      }
    },

    job_checklist: {
      description: 'Get the checklist for a service type, or record its completion on a job.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher', 'tech'],
      parameters: {
        type: 'object',
        properties: {
          service_type: { type: 'string' }, appointment_id: { type: 'integer' },
          completed: { type: 'array', items: { type: 'string' } }
        }
      },
      handler: async ({ service_type, appointment_id, completed }, ctx) => {
        if (completed && appointment_id) {
          const tpl = await JobChecklist.findOne({
            where: { tenant_id: ctx.tenant_id, service_type: service_type || 'mowing', is_template: true }, raw: true
          });
          const rec = await JobChecklist.create({
            tenant_id: ctx.tenant_id,
            service_type: service_type || 'mowing',
            items: (tpl && tpl.items) || [],
            appointment_id, completed,
            completed_by: ctx.user_id || null, completed_at: new Date(),
            is_template: false
          });
          const missing = ((tpl && tpl.items) || []).filter(i => !completed.includes(i));
          return {
            success: true, checklist_id: rec.id,
            complete: missing.length === 0,
            missing
          };
        }
        const tpl = await JobChecklist.findOne({
          where: { tenant_id: ctx.tenant_id, service_type: service_type || 'mowing', is_template: true }, raw: true
        });
        return { success: true, items: (tpl && tpl.items) || [] };
      }
    },

    performance_summary: {
      description: 'Jobs completed and hours worked per employee for a period.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const since = new Date(Date.now() - (Number(days) || 30) * 86400000);
        const entries = await TimeEntry.findAll({
          where: { tenant_id: ctx.tenant_id, work_date: { [Op.gte]: toDateStr(since) } }, raw: true
        });
        const emps = await Employee.findAll({ where: { tenant_id: ctx.tenant_id, status: 'active' }, raw: true });
        const records = await ServiceRecord.findAll({
          where: { tenant_id: ctx.tenant_id, completed_at: { [Op.gte]: since } }, raw: true
        });

        return {
          success: true,
          period_days: Number(days) || 30,
          employees: emps.map(e => {
            const mine = entries.filter(t => t.employee_id === e.id);
            const minutes = mine.reduce((a, t) => a + (t.minutes || 0), 0);
            const jobs = new Set(mine.map(t => t.appointment_id).filter(Boolean)).size;
            return {
              name: e.name,
              hours: Number((minutes / 60).toFixed(1)),
              jobs,
              minutes_per_job: jobs ? Math.round(minutes / jobs) : null
            };
          }).sort((a, b) => b.hours - a.hours),
          crew_jobs_completed: records.length
        };
      }
    }
  }
};
