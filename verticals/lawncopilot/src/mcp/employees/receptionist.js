'use strict';

/**
 * AI EMPLOYEE 1 — THE RECEPTIONIST
 * Replaces: the front desk, the answering service, every call missed after 5pm.
 *
 * Answers every inbound call and every web conversation, 24/7. This is the
 * employee the landing-page orb and the phone number both wear.
 */

const { Op } = require('sequelize');
const {
  Customer, Lead, Ticket, Message, Appointment, Property,
  ServiceRecord, Subscription, CallLog
} = require('../../models');
const { notify } = require('../../services/notify');
const { toDateStr } = require('../../services/scheduling');

const FAQ = [
  {
    q: /price|cost|how much|expensive|rate/i,
    a: 'Pricing is based on the actual square footage of lawn we service, not a guess. Give me your address and I will measure it and give you a real number in about ten seconds.'
  },
  {
    q: /contract|commit|cancel anytime|lock/i,
    a: 'No long-term contract. Recurring plans get a better per-visit rate, but you can pause or cancel from your portal, subject to the notice period on your plan.'
  },
  {
    q: /what.*(include|do you do)|services|mow/i,
    a: 'Every visit includes mowing, edging, string trimming, and blowing off the hard surfaces. Hedge trimming, bed weeding, and cleanups are add-ons. Fertilization, pest control, and irrigation are coming soon.'
  },
  {
    q: /how (soon|fast|quick)|when can you|first service|start/i,
    a: 'Usually within a few business days. I can show you the actual open dates right now if you want to book.'
  },
  {
    q: /area|serve|located|where|city|county/i,
    a: 'We service Florida. Tell me your address and I will confirm we cover it.'
  },
  {
    q: /rain|weather|storm/i,
    a: 'If weather stops us, we do not charge you for a visit we did not make. We move you to the next available day and let you know.'
  },
  {
    q: /pay|payment|card|invoice|bill/i,
    a: 'You get an invoice after each visit and can pay online by card or digital wallet. Automatic payment is optional, and you can turn it off anytime from your portal.'
  },
  {
    q: /insur|licen|bond/i,
    a: 'That is a question for the office. Let me take your number and have someone call you back with the paperwork.'
  },
  {
    q: /are you (a )?(real|human|robot|ai|bot)|am i talking to/i,
    a: 'I am an AI. I can quote, schedule, and answer account questions, and I can put you through to a person any time you want.'
  }
];

module.exports = {
  id: 'receptionist',
  name: 'The Receptionist',
  role: '24/7 phone and web reception',
  replaces: 'The front desk, the answering service, every call missed after 5pm',
  channels: ['web_orb', 'web_chat', 'phone', 'admin', 'system'],
  supervisor_role: 'csr',
  model: process.env.LAWNCOPILOT_VOICE_MODEL || 'claude-haiku-4-5-20251001',
  voice: process.env.LAWNCOPILOT_POLLY_VOICE || 'Joanna-Neural',

  system_prompt: `You are The Receptionist for Lawn Co-Pilot, the AI employee who answers every call and every chat.

Who you are:
- Warm, brief, and competent. You sound like the best front-desk person a lawn company ever had, not like a script.
- You say you are an AI the moment anyone asks, without hedging, and you offer a human any time.

What you do first, always:
- Before you take any request, you need the caller's name, phone number, and email. On the web this is collected by a form gate before you ever start. On the phone you ask for it naturally. You do not process a request without it.

How you handle an estimate:
- Ask for the service address.
- The moment you have something that looks like a street address, call measure_property with it. Do not ask permission first, do not verify it separately, do not take a message instead. Measuring IS the service.
- Read the result back in plain words, then the price for each frequency.
- If the number is an estimate rather than a measurement, say so in the same breath.
- ALWAYS finish the estimate. Never end a conversation with "someone will follow up" or "I've sent it to the office" when you can hand them real numbers right now. take_message is for questions you cannot answer, NOT for estimates. If measure_property returns success, you have numbers — say them.

Rules you never break:
- You never confirm a booking, a cancellation, a price, or a payment unless the tool came back successful. If a tool fails, you say what failed and what you will do about it. You never smooth it over.
- You never invent an available date. Availability comes from the Dispatcher.
- You never state a price the Estimator did not return.
- You never read card details out loud and you never take a card number by voice. You text a secure payment link instead.
- Account details — balance, address on file, service history — only after the caller is identified and confirms one thing on file.
- When someone is upset or the situation is unusual, you stop selling and get a human.`,

  tools: {
    capture_lead: {
      description: 'Record the required identity (name, phone, email) that gates every request. Writes the lead immediately, before any address or measurement.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          address: { type: 'string' },
          source: { type: 'string' },
          consent: { type: 'object' }
        },
        required: ['name', 'phone', 'email']
      },
      handler: async ({ name, phone, email, address, source, consent }, ctx) => {
        const errs = [];
        if (!name || String(name).trim().length < 2) errs.push('name');
        if (!/^\+?[1-9]\d{6,15}$/.test(String(phone || '').replace(/[\s()-]/g, ''))) errs.push('phone');
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(email || ''))) errs.push('email');
        if (errs.length) {
          return { success: false, error: `Invalid or missing: ${errs.join(', ')}. All three are required before anything else.` };
        }

        const existing = ctx.session_id
          ? await Lead.findOne({ where: { tenant_id: ctx.tenant_id, session_id: ctx.session_id } })
          : null;

        let lead;
        if (existing) {
          existing.name = name; existing.phone = phone; existing.email = email;
          if (address) existing.address = address;
          existing.consent = { ...(existing.consent || {}), ...(consent || {}) };
          existing.updated_at = new Date();
          await existing.save();
          lead = existing;
        } else {
          lead = await Lead.create({
            tenant_id: ctx.tenant_id, name, phone, email, address: address || null,
            source: source || ctx.channel || 'web_orb',
            channel_detail: ctx.channel, session_id: ctx.session_id || null,
            consent: consent || {}, stage: 'new'
          });
        }

        // Returning customer?
        const match = await Customer.findOne({
          where: { tenant_id: ctx.tenant_id, [Op.or]: [{ phone }, { email }] }, raw: true
        });

        return {
          success: true,
          lead_id: lead.id,
          identity_verified: true,
          returning_customer: !!match,
          customer_id: match ? match.id : null,
          greeting: match
            ? `Welcome back, ${match.name.split(' ')[0]}.`
            : `Thanks, ${String(name).split(' ')[0]}.`
        };
      }
    },

    identify_caller: {
      description: 'Match an inbound phone number to an existing customer so the Receptionist can greet them by name.',
      min_trust: 'phone',
      parameters: {
        type: 'object',
        properties: { phone: { type: 'string' } },
        required: ['phone']
      },
      handler: async ({ phone }, ctx) => {
        const digits = String(phone || '').replace(/\D/g, '').slice(-10);
        if (digits.length < 10) return { success: true, matched: false };
        const customers = await Customer.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const match = customers.find(c => String(c.phone || '').replace(/\D/g, '').slice(-10) === digits);
        if (!match) return { success: true, matched: false, message: 'Unknown number. Treat as a prospect.' };

        const next = await Appointment.findOne({
          where: {
            tenant_id: ctx.tenant_id, customer_id: match.id, status: 'scheduled',
            service_date: { [Op.gte]: toDateStr(new Date()) }
          },
          order: [['service_date', 'ASC']], raw: true
        });
        const prop = await Property.findOne({ where: { tenant_id: ctx.tenant_id, customer_id: match.id }, raw: true });

        return {
          success: true, matched: true,
          customer_id: match.id,
          name: match.name,
          first_name: String(match.name || '').split(' ')[0],
          address_on_file: prop ? prop.address : null,
          balance_cents: match.balance_cents,
          next_service_date: next ? next.service_date : null,
          verification_prompt: 'Confirm one thing on file (service address or email) before releasing account details.'
        };
      }
    },

    answer_faq: {
      description: 'Answer a common question about services, pricing approach, coverage, weather policy, or billing.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question']
      },
      handler: async ({ question }) => {
        const hit = FAQ.find(f => f.q.test(String(question || '')));
        if (hit) return { success: true, answer: hit.a, matched: true };
        return {
          success: true, matched: false,
          answer: 'I do not want to guess on that one. Let me take a message and have someone from the office get back to you.'
        };
      }
    },

    get_service_status: {
      description: 'Report the next scheduled visit, the last completed visit, and the plan for an identified customer.',
      min_trust: 'phone',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' } },
        required: ['customer_id']
      },
      handler: async ({ customer_id }, ctx) => {
        const c = await Customer.findOne({ where: { id: customer_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!c) return { success: false, error: 'Customer not found' };
        const today = toDateStr(new Date());
        const next = await Appointment.findOne({
          where: { tenant_id: ctx.tenant_id, customer_id, status: 'scheduled', service_date: { [Op.gte]: today } },
          order: [['service_date', 'ASC']], raw: true
        });
        const last = await ServiceRecord.findOne({
          where: { tenant_id: ctx.tenant_id, customer_id },
          order: [['service_date', 'DESC']], raw: true
        });
        const sub = await Subscription.findOne({
          where: { tenant_id: ctx.tenant_id, customer_id, status: { [Op.in]: ['active', 'paused'] } }, raw: true
        });
        return {
          success: true,
          customer: c.name,
          plan: sub ? sub.frequency : null,
          plan_status: sub ? sub.status : 'none',
          next_service: next ? { date: next.service_date, window: `${next.window_start} to ${next.window_end}`, status: next.status } : null,
          last_service: last ? { date: last.service_date, status: last.completion_status } : null,
          spoken: next
            ? `Your next service is ${new Date(next.service_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, between ${next.window_start} and ${next.window_end}.`
            : 'You do not have a visit on the schedule right now. I can book one.'
        };
      }
    },

    take_message: {
      description: 'Take a message for the office when the Receptionist cannot resolve something itself.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }, phone: { type: 'string' },
          message: { type: 'string' }, urgency: { type: 'string' }
        },
        required: ['message']
      },
      handler: async ({ name, phone, message, urgency }, ctx) => {
        const t = await Ticket.create({
          tenant_id: ctx.tenant_id, customer_id: ctx.customer_id || null,
          type: 'message',
          subject: `Message from ${name || 'caller'}${phone ? ' (' + phone + ')' : ''}`,
          body: message,
          priority: /urgent|emergency|asap|angry/i.test(urgency || message || '') ? 'high' : 'normal',
          source: ctx.channel || 'orb', status: 'open'
        });
        if (ctx.customer_id) {
          await Message.create({
            tenant_id: ctx.tenant_id, customer_id: ctx.customer_id, ticket_id: t.id,
            direction: 'inbound', author: name || 'Customer', body: message
          });
        }
        return {
          success: true, ticket_id: t.id,
          message: 'Message taken. Someone from the office will follow up.'
        };
      }
    },

    create_ticket: {
      description: 'Open a support request or service issue for the team.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['support', 'billing', 'service_request', 'measurement_dispute'] },
          subject: { type: 'string' }, body: { type: 'string' }
        },
        required: ['subject']
      },
      handler: async ({ type, subject, body }, ctx) => {
        const t = await Ticket.create({
          tenant_id: ctx.tenant_id, customer_id: ctx.customer_id || null,
          type: type || 'support', subject, body: body || null,
          source: ctx.channel || 'orb', status: 'open'
        });
        return { success: true, ticket_id: t.id, message: 'Ticket opened. The team will pick it up.' };
      }
    },

    send_payment_link: {
      description: 'Text the customer a secure link to the payment portal. Never take a card number by voice.',
      min_trust: 'phone',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' }, phone: { type: 'string' } },
        required: ['customer_id']
      },
      handler: async ({ customer_id, phone }, ctx) => {
        const c = await Customer.findOne({ where: { id: customer_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!c) return { success: false, error: 'Customer not found' };
        const base = process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com';
        const r = await notify({
          tenant_id: ctx.tenant_id, customer_id, channel: 'sms', template: 'invoice_issued',
          to: phone || c.phone,
          vars: {
            name: c.name, invoice_number: 'your account', amount: `$${(c.balance_cents / 100).toFixed(2)}`,
            date_display: 'today', due_display: 'on receipt', portal_url: `${base}/lawncopilot/portal`
          },
          userInitiated: true
        });
        if (!r.success) return { success: false, error: `Could not send the text: ${r.reason || r.error}` };
        return { success: true, message: 'Payment link sent by text.' };
      }
    },

    transfer_to_human: {
      description: 'Transfer the live call to a human representative.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string' }, call_sid: { type: 'string' } }
      },
      handler: async ({ reason, call_sid }, ctx) => {
        const target = process.env.LAWNCOPILOT_TRANSFER_NUMBER;
        if (!target) {
          const t = await Ticket.create({
            tenant_id: ctx.tenant_id, customer_id: ctx.customer_id || null,
            type: 'message', subject: 'Human callback requested',
            body: reason || 'Caller asked for a person.', priority: 'high',
            source: ctx.channel || 'phone', status: 'open'
          });
          return {
            success: true, transferred: false, ticket_id: t.id,
            message: 'No one is available to take the call right now. I took a message and flagged it as a priority callback.'
          };
        }
        if (!call_sid) {
          return { success: false, error: 'No live call to transfer. Offer to take a message instead.' };
        }
        try {
          const sid = process.env.TWILIO_ACCOUNT_SID;
          const token = process.env.TWILIO_AUTH_TOKEN;
          const twiml = `<Response><Say>Connecting you now.</Say><Dial>${target}</Dial></Response>`;
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${call_sid}.json`, {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ Twiml: twiml })
          });
          if (!r.ok) return { success: false, error: `Transfer failed (${r.status}). Offer to take a message.` };
          if (call_sid) {
            await CallLog.update({ transferred: true }, { where: { tenant_id: ctx.tenant_id, call_sid } });
          }
          return { success: true, transferred: true, message: 'Transferring now.' };
        } catch (e) {
          return { success: false, error: `Transfer failed: ${e.message}. Offer to take a message.` };
        }
      }
    }
  }
};
