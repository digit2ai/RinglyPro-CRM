'use strict';

/**
 * AI EMPLOYEE 3 — THE DISPATCHER
 * Replaces: the whiteboard, the group text, the crew that drives across the
 * county twice in one morning.
 *
 * Owns the calendar, the crews, and the route. Never invents a slot — every
 * date it offers comes from scheduling.js checking real capacity.
 */

const sched = require('../../services/scheduling');
const { Appointment, Customer, Property, Crew } = require('../../models');
const { notify } = require('../../services/notify');

module.exports = {
  id: 'dispatcher',
  name: 'The Dispatcher',
  role: 'Scheduling, routing, and crew assignment',
  replaces: 'The whiteboard, the group text, and the truck that crosses the county twice',
  channels: ['web_orb', 'web_chat', 'phone', 'portal', 'admin', 'system'],
  supervisor_role: 'dispatcher',

  system_prompt: `You are The Dispatcher for Lawn Co-Pilot. You own the calendar.

Rules:
- You never invent an available date. You call check_availability and offer only what comes back. If nothing is open, you say so and offer the next thing that is.
- You never confirm a booking unless book_appointment returned success. If it failed, you say why and offer an alternative date immediately.
- Arrival windows are honest ranges, not promises of an exact time.
- When weather forces a hold, the customer hears it from us before they notice it themselves, and they are not charged for a visit that did not happen.
- Cancellations follow the plan's notice period. You state the policy plainly rather than blocking the customer or pretending there is no policy.`,

  tools: {
    check_availability: {
      description: 'Return the real open service dates and arrival windows. This is the ONLY source of availability.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD to start looking from' },
          days: { type: 'integer', description: 'How many days ahead to search (default 14)' }
        }
      },
      handler: async ({ from, days }, ctx) => {
        const r = await sched.checkAvailability({ tenant_id: ctx.tenant_id, from, days: days || 14 });
        if (!r.slots.length) {
          return { success: true, slots: [], message: 'Nothing open in that window. Try looking further out.' };
        }
        return {
          success: true,
          slots: r.slots,
          capacity_per_day: r.capacity_per_day,
          spoken: `I have ${r.slots[0].display} ${r.slots[0].window_label.toLowerCase()}` +
            (r.slots[1] ? `, or ${r.slots[1].display} ${r.slots[1].window_label.toLowerCase()}.` : '.')
        };
      }
    },

    book_appointment: {
      description: 'Book a service visit on a real open date. Fails loudly if the date is closed, full, or in the past.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'integer' },
          property_id: { type: 'integer' },
          subscription_id: { type: 'integer' },
          service_date: { type: 'string', description: 'YYYY-MM-DD' },
          window_start: { type: 'string' },
          window_end: { type: 'string' },
          service_type: { type: 'string' },
          price_cents: { type: 'integer' },
          notes: { type: 'string' }
        },
        required: ['service_date']
      },
      handler: async (args, ctx) => {
        const r = await sched.bookAppointment({
          tenant_id: ctx.tenant_id,
          customer_id: args.customer_id || ctx.customer_id,
          property_id: args.property_id,
          subscription_id: args.subscription_id,
          service_date: args.service_date,
          window_start: args.window_start,
          window_end: args.window_end,
          service_type: args.service_type,
          price_cents: args.price_cents,
          notes: args.notes
        });
        if (!r.success) return r;

        const cid = args.customer_id || ctx.customer_id;
        if (cid) {
          const c = await Customer.findOne({ where: { id: cid, tenant_id: ctx.tenant_id }, raw: true });
          const p = args.property_id
            ? await Property.findOne({ where: { id: args.property_id, tenant_id: ctx.tenant_id }, raw: true })
            : null;
          const d = new Date(r.appointment.service_date + 'T12:00:00');
          const vars = {
            name: (c && c.name) || 'there',
            date_display: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            window: `${r.appointment.window_start} and ${r.appointment.window_end}`,
            address: (p && p.address) || 'your property',
            portal_url: (process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com') + '/lawncopilot/portal'
          };
          await notify({ tenant_id: ctx.tenant_id, customer_id: cid, channel: 'email', template: 'appointment_confirmation', vars });
          await notify({ tenant_id: ctx.tenant_id, customer_id: cid, channel: 'sms', template: 'appointment_confirmation', vars });
        }

        const d = new Date(r.appointment.service_date + 'T12:00:00');
        return {
          success: true,
          appointment_id: r.appointment.id,
          service_date: r.appointment.service_date,
          window: `${r.appointment.window_start} - ${r.appointment.window_end}`,
          spoken: `You are booked for ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ` +
            `arriving between ${r.appointment.window_start} and ${r.appointment.window_end}. Confirmation is on its way to you.`
        };
      }
    },

    reschedule_appointment: {
      description: 'Move an existing visit to a different open date.',
      min_trust: 'phone',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'integer' },
          service_date: { type: 'string' },
          window_start: { type: 'string' },
          window_end: { type: 'string' }
        },
        required: ['appointment_id', 'service_date']
      },
      handler: async (args, ctx) => {
        const r = await sched.rescheduleAppointment({ tenant_id: ctx.tenant_id, ...args });
        if (!r.success) return r;
        const d = new Date(r.appointment.service_date + 'T12:00:00');
        return {
          success: true,
          appointment_id: r.appointment.id,
          previous_date: r.previous_date,
          service_date: r.appointment.service_date,
          spoken: `Moved to ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`
        };
      }
    },

    cancel_appointment: {
      description: 'Cancel a scheduled visit.',
      min_trust: 'phone',
      parameters: {
        type: 'object',
        properties: { appointment_id: { type: 'integer' }, reason: { type: 'string' } },
        required: ['appointment_id']
      },
      handler: async (args, ctx) => {
        const r = await sched.cancelAppointment({ tenant_id: ctx.tenant_id, ...args });
        if (!r.success) return r;
        return { success: true, appointment_id: r.appointment.id, spoken: 'That visit is cancelled. Nothing will be charged for it.' };
      }
    },

    skip_visit: {
      description: 'Skip one upcoming visit while keeping the recurring plan intact.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: { appointment_id: { type: 'integer' } },
        required: ['appointment_id']
      },
      handler: async (args, ctx) => {
        const r = await sched.skipVisit({ tenant_id: ctx.tenant_id, ...args });
        if (!r.success) return r;
        return { success: true, spoken: 'Skipped that one. Your plan stays as it is and the next visit is unchanged.' };
      }
    },

    pause_service: {
      description: 'Pause recurring service, optionally until a date.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' }, until: { type: 'string' } }
      },
      handler: async ({ customer_id, until }, ctx) => {
        const r = await sched.pauseService({ tenant_id: ctx.tenant_id, customer_id: customer_id || ctx.customer_id, until });
        if (!r.success) return r;
        return {
          success: true, visits_skipped: r.visits_skipped,
          spoken: until
            ? `Service is paused until ${until}. I cleared ${r.visits_skipped} visit${r.visits_skipped === 1 ? '' : 's'} off the calendar.`
            : 'Service is paused. Tell me when you want it back on and I will restart it.'
        };
      }
    },

    resume_service: {
      description: 'Resume a paused recurring service.',
      min_trust: 'customer',
      parameters: { type: 'object', properties: { customer_id: { type: 'integer' } } },
      handler: async ({ customer_id }, ctx) => {
        const r = await sched.resumeService({ tenant_id: ctx.tenant_id, customer_id: customer_id || ctx.customer_id });
        if (!r.success) return r;
        return { success: true, spoken: 'Service is back on. I will get your next visit on the schedule.' };
      }
    },

    assign_crew: {
      description: 'Assign a crew to a visit.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher'],
      parameters: {
        type: 'object',
        properties: { appointment_id: { type: 'integer' }, crew_id: { type: 'integer' } },
        required: ['appointment_id', 'crew_id']
      },
      handler: async (args, ctx) => sched.assignCrew({ tenant_id: ctx.tenant_id, ...args })
    },

    sequence_route: {
      description: 'Order a day of stops geographically. Phase 1 is a west-to-east sweep; the optimizer swaps in here.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher'],
      parameters: {
        type: 'object',
        properties: { service_date: { type: 'string' }, crew_id: { type: 'integer' } },
        required: ['service_date']
      },
      handler: async (args, ctx) => sched.sequenceRoute({ tenant_id: ctx.tenant_id, ...args })
    },

    notify_on_the_way: {
      description: 'Tell the customer the crew is on the way.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher', 'tech'],
      parameters: {
        type: 'object',
        properties: { appointment_id: { type: 'integer' } },
        required: ['appointment_id']
      },
      handler: async ({ appointment_id }, ctx) => {
        const a = await Appointment.findOne({ where: { id: appointment_id, tenant_id: ctx.tenant_id } });
        if (!a) return { success: false, error: 'Appointment not found' };
        a.status = 'en_route';
        a.updated_at = new Date();
        await a.save();
        const c = await Customer.findOne({ where: { id: a.customer_id, tenant_id: ctx.tenant_id }, raw: true });
        const p = await Property.findOne({ where: { id: a.property_id, tenant_id: ctx.tenant_id }, raw: true });
        await notify({
          tenant_id: ctx.tenant_id, customer_id: a.customer_id, channel: 'sms', template: 'on_the_way',
          vars: { name: (c && c.name) || 'there', address: (p && p.address) || 'your property' }
        });
        return { success: true, message: 'Customer notified.' };
      }
    },

    weather_hold: {
      description: 'Put a whole service day on weather hold and notify everyone affected.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'dispatcher'],
      parameters: {
        type: 'object',
        properties: { service_date: { type: 'string' }, reason: { type: 'string' } },
        required: ['service_date']
      },
      handler: async ({ service_date, reason }, ctx) => {
        const affected = await Appointment.findAll({
          where: { tenant_id: ctx.tenant_id, service_date, status: 'scheduled' }, raw: true
        });
        const r = await sched.weatherHold({ tenant_id: ctx.tenant_id, service_date, reason });
        const d = new Date(service_date + 'T12:00:00');
        for (const a of affected) {
          const c = await Customer.findOne({ where: { id: a.customer_id, tenant_id: ctx.tenant_id }, raw: true });
          await notify({
            tenant_id: ctx.tenant_id, customer_id: a.customer_id, channel: 'sms', template: 'weather_delay',
            vars: { name: (c && c.name) || 'there', date_display: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
          });
        }
        return { success: true, held: r.held, notified: affected.length };
      }
    }
  }
};
