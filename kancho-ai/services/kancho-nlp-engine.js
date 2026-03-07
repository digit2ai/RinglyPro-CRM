'use strict';

/**
 * KanchoAI NLP Engine
 *
 * Parses natural language (chat + voice transcript) into structured commands,
 * routes to existing KanchoAI services, enforces safety, and logs everything.
 *
 * Architecture:
 *   1. Normalizer  — clean raw text
 *   2. Intent Router — classify domain + action
 *   3. Entity Extractor — pull names, dates, amounts, etc.
 *   4. Execution Planner — check completeness, ask clarification, require confirmation
 *   5. Command Executor — call existing CRUD routes/models
 *   6. Response Formatter — human-readable summary
 *   7. Audit Logger — store everything
 */

const { Op } = require('sequelize');

// ============================================================
// DOMAIN & INTENT DEFINITIONS
// ============================================================

const DOMAINS = {
  students: { aliases: ['student', 'member', 'members', 'kid', 'kids', 'enrollment'] },
  leads: { aliases: ['lead', 'prospect', 'prospects', 'inquiry', 'inquiries', 'convert lead', 'convert a lead'] },
  families: { aliases: ['family', 'parent', 'parents', 'guardian', 'household'] },
  staff: { aliases: ['instructor', 'instructors', 'coach', 'coaches', 'employee', 'employees', 'teacher', 'trainer'] },
  training: { aliases: ['program', 'programs', 'curriculum', 'level', 'levels'] },
  belts: { aliases: ['belt', 'rank', 'ranks', 'promotion', 'promotions', 'testing', 'grading'] },
  classes: { aliases: ['class', 'session', 'sessions', 'schedule', 'lesson', 'lessons'] },
  calendar: { aliases: ['event', 'events', 'appointment', 'appointments', 'reminder', 'meeting'] },
  payments: { aliases: ['payment', 'charge', 'charges', 'transaction', 'transactions', 'refund'] },
  billing: { aliases: ['invoice', 'invoices', 'subscription', 'subscriptions', 'plan', 'billing', 'overdue', 'balance'] },
  merch: { aliases: ['merchandise', 'product', 'products', 'item', 'items', 'stock', 'inventory', 'hoodie', 'gi', 'gear', 'order', 'orders'] },
  portal: { aliases: ['portal', 'access', 'invite', 'activation'] },
  automations: { aliases: ['automation', 'workflow', 'workflows', 'auto', 'trigger'] },
  tasks: { aliases: ['task', 'tasks', 'to-do', 'todo', 'follow-up', 'followup', 'action item', 'overdue task', 'overdue tasks', 'pending task', 'pending tasks', 'create task', 'create a task'] },
  funnels: { aliases: ['funnel', 'pipeline', 'conversion'] },
  campaigns: { aliases: ['campaign', 'outreach', 'marketing', 'email blast', 'sms blast'] },
  growth: { aliases: ['growth', 'insight', 'insights', 'analytics', 'trend', 'trends', 'ai', 'advisor', 'summary', 'report'] },
  promotions: { aliases: ['promo', 'offer', 'discount', 'referral', 'deal', 'special'] }
};

const INTENT_PATTERNS = [
  // Create
  { intent: 'create', patterns: ['add', 'create', 'new', 'register', 'enroll', 'sign up', 'record', 'log', 'build', 'make', 'set up', 'setup', 'open'] },
  // Read
  { intent: 'read', patterns: ['show', 'list', 'get', 'give me', 'find', 'search', 'look up', 'lookup', 'view', 'display', 'who', 'what', 'how many', 'count', 'check'] },
  // Update
  { intent: 'update', patterns: ['update', 'edit', 'change', 'modify', 'move', 'set', 'assign', 'rename', 'switch', 'transfer', 'adjust'] },
  // Delete/Archive
  { intent: 'delete', patterns: ['delete', 'remove', 'archive', 'deactivate', 'drop'] },
  // Analyze
  { intent: 'analyze', patterns: ['analyze', 'summarize', 'report', 'trend', 'insights', 'breakdown', 'compare', 'review'] },
  // Trigger
  { intent: 'trigger', patterns: ['trigger', 'run', 'execute', 'fire', 'start', 'launch', 'send', 'resend', 'retry'] },
  // Promote
  { intent: 'promote', patterns: ['promote', 'advance', 'upgrade', 'level up'] },
  // Convert
  { intent: 'convert', patterns: ['convert', 'graduate', 'transition'] },
  // Pause
  { intent: 'pause', patterns: ['pause', 'freeze', 'hold', 'suspend', 'stop'] },
  // Resume
  { intent: 'resume', patterns: ['resume', 'unpause', 'reactivate', 'restart', 'unfreeze'] },
  // Cancel
  { intent: 'cancel', patterns: ['cancel', 'terminate', 'end'] },
  // Schedule
  { intent: 'schedule', patterns: ['schedule', 'book', 'reserve', 'plan'] },
  // Assign
  { intent: 'assign', patterns: ['assign', 'delegate'] },
  // Duplicate
  { intent: 'duplicate', patterns: ['duplicate', 'copy', 'clone'] }
];

// Actions that require confirmation before execution
const DESTRUCTIVE_ACTIONS = new Set([
  'delete', 'cancel', 'archive', 'deactivate', 'refund', 'bulk_update',
  'pause_billing', 'cancel_membership', 'cancel_class', 'convert_lead',
  'archive_student', 'archive_lead', 'archive_family', 'archive_product',
  'deactivate_staff', 'delete_event', 'delete_automation', 'delete_task',
  'delete_funnel', 'delete_campaign', 'delete_promotion'
]);

// Domain-specific action mappings
const ACTION_MAP = {
  students: {
    create: 'add_student', read: 'list_students', update: 'update_student',
    delete: 'archive_student', analyze: 'analyze_students',
    promote: 'promote_belt'
  },
  leads: {
    create: 'add_lead', read: 'list_leads', update: 'update_lead',
    delete: 'archive_lead', convert: 'convert_lead', assign: 'assign_lead'
  },
  families: {
    create: 'create_family', read: 'list_families', update: 'update_family',
    delete: 'archive_family'
  },
  staff: {
    create: 'add_staff', read: 'list_staff', update: 'update_staff',
    delete: 'deactivate_staff', assign: 'assign_staff'
  },
  training: {
    create: 'assign_program', read: 'list_programs', update: 'update_program'
  },
  belts: {
    create: 'record_promotion', read: 'list_promotions', promote: 'promote_student',
    analyze: 'promotion_readiness'
  },
  classes: {
    create: 'create_class', read: 'list_classes', update: 'update_class',
    delete: 'cancel_class', assign: 'assign_instructor', schedule: 'create_class',
    duplicate: 'duplicate_class'
  },
  calendar: {
    create: 'create_event', read: 'list_events', update: 'update_event',
    delete: 'delete_event', schedule: 'schedule_event'
  },
  payments: {
    read: 'list_payments', trigger: 'retry_payment', analyze: 'payment_trends'
  },
  billing: {
    read: 'list_billing', update: 'update_subscription', pause: 'pause_billing',
    resume: 'resume_billing', cancel: 'cancel_membership', analyze: 'billing_report'
  },
  merch: {
    create: 'add_product', read: 'list_products', update: 'update_product',
    delete: 'archive_product'
  },
  portal: {
    read: 'portal_status', trigger: 'resend_invite', update: 'update_access'
  },
  automations: {
    create: 'create_automation', read: 'list_automations', update: 'update_automation',
    pause: 'pause_automation', resume: 'resume_automation', trigger: 'trigger_automation',
    delete: 'delete_automation'
  },
  tasks: {
    create: 'create_task', read: 'list_tasks', update: 'update_task',
    delete: 'delete_task', assign: 'assign_task'
  },
  funnels: {
    create: 'create_funnel', read: 'list_funnels', update: 'update_funnel',
    delete: 'delete_funnel', duplicate: 'duplicate_funnel', trigger: 'launch_funnel',
    analyze: 'funnel_performance'
  },
  campaigns: {
    create: 'create_campaign', read: 'list_campaigns', update: 'update_campaign',
    pause: 'pause_campaign', resume: 'resume_campaign', trigger: 'launch_campaign',
    delete: 'delete_campaign', analyze: 'campaign_performance', duplicate: 'duplicate_campaign'
  },
  growth: {
    read: 'growth_summary', analyze: 'growth_insights'
  },
  promotions: {
    create: 'create_promotion', read: 'list_promotions_marketing', trigger: 'launch_promotion',
    pause: 'pause_promotion', resume: 'resume_promotion', analyze: 'promotion_performance'
  }
};

// ============================================================
// NLP ENGINE CLASS
// ============================================================

class KanchoNLPEngine {
  constructor(models) {
    this.models = models;
  }

  // ── 1. NORMALIZER ──────────────────────────────────────────
  normalize(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\buh+\b|\bum+\b|\blike\b|\byou know\b|\bactually\b|\bbasically\b/g, '')
      .replace(/\bplease\b|\bcan you\b|\bcould you\b|\bi want to\b|\bi need to\b|\bi'd like to\b/g, '')
      .replace(/\bgo ahead and\b|\bjust\b|\bkindly\b/g, '')
      .replace(/[.,!?;]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── 2. INTENT ROUTER ──────────────────────────────────────
  classifyIntent(text) {
    const norm = this.normalize(text);
    let bestIntent = 'read'; // default to read
    let bestScore = 0;
    let matchedPattern = '';

    for (const { intent, patterns } of INTENT_PATTERNS) {
      for (const p of patterns) {
        const idx = norm.indexOf(p);
        if (idx !== -1) {
          // Earlier in text = higher score; exact word boundary = bonus
          const posScore = 1 - (idx / Math.max(norm.length, 1));
          const wordBoundary = (idx === 0 || norm[idx - 1] === ' ') ? 0.2 : 0;
          const score = posScore + wordBoundary + (p.length / 20);
          if (score > bestScore) {
            bestScore = score;
            bestIntent = intent;
            matchedPattern = p;
          }
        }
      }
    }

    return { intent: bestIntent, confidence: Math.min(bestScore, 1), matchedPattern };
  }

  // ── 3. DOMAIN CLASSIFIER ──────────────────────────────────
  classifyDomain(text) {
    const norm = this.normalize(text);
    let bestDomain = null;
    let bestScore = 0;

    for (const [domain, { aliases }] of Object.entries(DOMAINS)) {
      for (const alias of [domain, ...aliases]) {
        const idx = norm.indexOf(alias);
        if (idx !== -1) {
          const score = alias.length + (idx < 20 ? 0.5 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestDomain = domain;
          }
        }
      }
    }

    // Contextual hints when no explicit domain keyword
    if (!bestDomain) {
      if (/at[\s-]?risk|churn|inactive|retain|retention|dropout|hasn't attended|no attendance/.test(norm)) bestDomain = 'students';
      else if (/revenue|mrr|income|money|earnings/.test(norm)) bestDomain = 'growth';
      else if (/overdue|unpaid|past due|failed payment/.test(norm)) bestDomain = 'billing';
      else if (/schedule|book|lesson|private/.test(norm)) bestDomain = 'calendar';
      else if (/belt|rank|promote|testing|grading/.test(norm)) bestDomain = 'belts';
      else if (/enroll|sign up|signup|register/.test(norm)) bestDomain = 'students';
    }

    return { domain: bestDomain, confidence: bestDomain ? Math.min(bestScore / 10 + 0.5, 0.99) : 0 };
  }

  // ── 4. ENTITY EXTRACTOR ────────────────────────────────────
  extractEntities(text) {
    const norm = this.normalize(text);
    const entities = {};

    // Names — "named X Y", "called X Y", proper nouns
    const namePatterns = [
      /(?:named?|called?|for|with)\s+([A-Z][a-z]+(?:\s+(?!from\b|in\b|on\b|to\b|at\b|for\b|with\b|and\b|or\b|the\b|into\b|as\b|by\b|about\b)[A-Z][a-z]+)?)/i,
      /(?:student|lead|member|coach|instructor|staff)\s+([A-Z][a-z]+(?:\s+(?!from\b|in\b|on\b|to\b|at\b|for\b|with\b|and\b|or\b|the\b|into\b|as\b|by\b|about\b)[A-Z][a-z]+)?)/i
    ];
    for (const re of namePatterns) {
      const m = text.match(re);
      if (m) {
        const parts = m[1].trim().split(/\s+/);
        entities.firstName = parts[0];
        if (parts.length > 1) entities.lastName = parts.slice(1).join(' ');
        break;
      }
    }

    // Dollar amounts
    const moneyMatch = norm.match(/\$\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks)/);
    if (moneyMatch) entities.amount = parseFloat((moneyMatch[1] || moneyMatch[2]).replace(/,/g, ''));

    // Dates
    const datePatterns = [
      { re: /(?:on|for|by|due|starting|until|from)\s+(\d{4}-\d{2}-\d{2})/, type: 'iso' },
      { re: /(?:on|for|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, type: 'weekday' },
      { re: /(?:on|for|by)\s+(today|tomorrow|yesterday|next week|next month|last week|last month|this week|this month)/i, type: 'relative' },
      { re: /(?:in|for)\s+(\d+)\s+(day|week|month|year)s?/i, type: 'relative_num' },
      { re: /(\d+)\s+(day|week|month|year)s?\s+ago/i, type: 'relative_ago' }
    ];
    for (const { re, type } of datePatterns) {
      const m = norm.match(re);
      if (m) {
        if (type === 'iso') entities.date = m[1];
        else if (type === 'weekday') entities.dayOfWeek = m[1];
        else if (type === 'relative') entities.relativeDate = m[1];
        else if (type === 'relative_num') { entities.dateOffset = parseInt(m[1]); entities.dateUnit = m[2]; }
        else if (type === 'relative_ago') { entities.dateOffset = -parseInt(m[1]); entities.dateUnit = m[2]; }
        break;
      }
    }

    // Times
    const timeMatch = norm.match(/(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const min = timeMatch[2] || '00';
      const ampm = (timeMatch[3] || '').replace(/\./g, '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      entities.time = String(h).padStart(2, '0') + ':' + min;
    }

    // Days count (for "in X days" / "X days ago")
    const daysMatch = norm.match(/(\d+)\s*days?/);
    if (daysMatch && !entities.dateOffset) entities.daysCount = parseInt(daysMatch[1]);

    // Status keywords
    const statusKeywords = ['at-risk', 'at risk', 'active', 'inactive', 'cancelled', 'past due', 'overdue', 'failed', 'pending', 'trial', 'paused', 'draft', 'completed', 'hot', 'warm', 'cold'];
    for (const s of statusKeywords) {
      if (norm.includes(s)) { entities.status = s; break; }
    }

    // Source keywords
    const sourceKeywords = ['facebook', 'instagram', 'google', 'referral', 'walk-in', 'walkin', 'website', 'phone', 'ads'];
    for (const s of sourceKeywords) {
      if (norm.includes(s)) { entities.source = s; break; }
    }

    // Role keywords
    const roleMatch = norm.match(/(?:as|role)\s+(owner|head instructor|instructor|assistant|front desk)/i);
    if (roleMatch) entities.role = roleMatch[1].toLowerCase().replace(/\s+/g, '_');

    // Belt keywords
    const beltMatch = norm.match(/(white|yellow|orange|green|blue|purple|brown|red|black(?:\s+\d+(?:st|nd|rd|th)\s+dan)?)\s*belt/i);
    if (beltMatch) entities.belt = beltMatch[1].trim();
    // Also check for "to yellow belt" style
    const toBeltMatch = norm.match(/to\s+(white|yellow|orange|green|blue|purple|brown|red|black(?:\s+\d+(?:st|nd|rd|th)\s+dan)?)/i);
    if (toBeltMatch && !entities.belt) entities.belt = toBeltMatch[1].trim();

    // Program / class name — "to X" after move/transfer/assign
    const progMatch = text.match(/(?:to|into|in|for)\s+(?:the\s+)?([A-Z][A-Za-z\s]+(?:class|karate|jiu.?jitsu|bjj|taekwondo|mma|kickboxing|muay thai|judo|program))/i);
    if (progMatch) entities.programName = progMatch[1].trim();

    // Priority
    const prioMatch = norm.match(/(low|medium|high|urgent)\s*priority/);
    if (prioMatch) entities.priority = prioMatch[1];

    // Type keywords for campaigns/automations
    const typeMatch = norm.match(/(sms|email|voice|multi.?channel)/i);
    if (typeMatch) entities.channelType = typeMatch[1].toLowerCase().replace(/[^a-z]/g, '_');

    // Numeric ID
    const idMatch = norm.match(/(?:id|#)\s*(\d+)/);
    if (idMatch) entities.recordId = parseInt(idMatch[1]);

    return entities;
  }

  // ── 4b. RESOLVE RELATIVE DATES ────────────────────────────
  resolveRelativeDate(entities) {
    const now = new Date();
    if (entities.relativeDate) {
      const rd = entities.relativeDate.toLowerCase();
      if (rd === 'today') {
        entities.date = now.toISOString().split('T')[0];
      } else if (rd === 'tomorrow') {
        const d = new Date(now); d.setDate(d.getDate() + 1);
        entities.date = d.toISOString().split('T')[0];
      } else if (rd === 'yesterday') {
        const d = new Date(now); d.setDate(d.getDate() - 1);
        entities.date = d.toISOString().split('T')[0];
      } else if (rd === 'next week') {
        const d = new Date(now); d.setDate(d.getDate() + 7);
        entities.date = d.toISOString().split('T')[0];
      } else if (rd === 'next month') {
        const d = new Date(now); d.setMonth(d.getMonth() + 1);
        entities.date = d.toISOString().split('T')[0];
      } else if (rd === 'last week') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        entities.date = d.toISOString().split('T')[0];
        const end = new Date(d); end.setDate(end.getDate() + 6);
        entities.dateEnd = end.toISOString().split('T')[0];
      } else if (rd === 'last month') {
        const d = new Date(now); d.setMonth(d.getMonth() - 1);
        entities.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        entities.dateEnd = lastDay.toISOString().split('T')[0];
      } else if (rd === 'this week') {
        // Start of current week (Monday)
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        entities.date = d.toISOString().split('T')[0];
        entities.dateEnd = now.toISOString().split('T')[0];
      } else if (rd === 'this month') {
        entities.date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
        entities.dateEnd = now.toISOString().split('T')[0];
      }
    }
    if (entities.dateOffset && entities.dateUnit) {
      const d = new Date(now);
      const unit = entities.dateUnit.toLowerCase();
      if (unit === 'day') d.setDate(d.getDate() + entities.dateOffset);
      else if (unit === 'week') d.setDate(d.getDate() + entities.dateOffset * 7);
      else if (unit === 'month') d.setMonth(d.getMonth() + entities.dateOffset);
      else if (unit === 'year') d.setFullYear(d.getFullYear() + entities.dateOffset);
      entities.date = d.toISOString().split('T')[0];
    }
    if (entities.dayOfWeek && !entities.date) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const target = days.indexOf(entities.dayOfWeek.toLowerCase());
      if (target !== -1) {
        const d = new Date(now);
        const current = d.getDay();
        const daysUntil = (target - current + 7) % 7 || 7;
        d.setDate(d.getDate() + daysUntil);
        entities.date = d.toISOString().split('T')[0];
      }
    }
    return entities;
  }

  // ── 5. RESOLVE ACTION ──────────────────────────────────────
  resolveAction(intent, domain) {
    const domainActions = ACTION_MAP[domain];
    if (!domainActions) return intent;
    return domainActions[intent] || intent;
  }

  // ── 6. FULL PARSE ─────────────────────────────────────────
  parse(rawText) {
    const normalized = this.normalize(rawText);
    const { intent, confidence: intentConf, matchedPattern } = this.classifyIntent(rawText);
    const { domain, confidence: domainConf } = this.classifyDomain(rawText);
    const entities = this.extractEntities(rawText);
    this.resolveRelativeDate(entities);
    const action = domain ? this.resolveAction(intent, domain) : intent;

    const confidence = Math.round(((intentConf + domainConf) / 2) * 1000) / 1000;
    const requiresConfirmation = DESTRUCTIVE_ACTIONS.has(action) || DESTRUCTIVE_ACTIONS.has(intent);
    const clarificationNeeded = !domain || confidence < 0.3;

    return {
      raw: rawText,
      normalized,
      intent,
      domain,
      action,
      entities,
      confidence,
      requiresConfirmation,
      clarificationNeeded,
      matchedPattern
    };
  }

  // ── 7. ENTITY RESOLUTION (fuzzy match records) ─────────────
  async resolveEntities(parsed, schoolId) {
    const { entities, domain } = parsed;
    const resolved = { ...entities };

    // Fuzzy match student by name
    if (entities.firstName && ['students', 'belts', 'training', 'billing', 'payments'].includes(domain)) {
      const where = { school_id: schoolId };
      if (entities.lastName) {
        where[Op.or] = [
          { first_name: { [Op.iLike]: '%' + entities.firstName + '%' }, last_name: { [Op.iLike]: '%' + entities.lastName + '%' } }
        ];
      } else {
        where[Op.or] = [
          { first_name: { [Op.iLike]: '%' + entities.firstName + '%' } },
          { last_name: { [Op.iLike]: '%' + entities.firstName + '%' } }
        ];
      }
      try {
        const matches = await this.models.KanchoStudent.findAll({ where, limit: 5, order: [['first_name', 'ASC']] });
        if (matches.length === 1) {
          resolved.matchedStudent = { id: matches[0].id, name: matches[0].first_name + ' ' + matches[0].last_name };
        } else if (matches.length > 1) {
          resolved.studentCandidates = matches.map(s => ({ id: s.id, name: s.first_name + ' ' + s.last_name, belt: s.belt_rank, status: s.status }));
        }
      } catch (e) { /* model may not exist yet */ }
    }

    // Fuzzy match lead by name
    if (entities.firstName && domain === 'leads') {
      const where = { school_id: schoolId };
      if (entities.lastName) {
        where[Op.or] = [
          { first_name: { [Op.iLike]: '%' + entities.firstName + '%' }, last_name: { [Op.iLike]: '%' + entities.lastName + '%' } }
        ];
      } else {
        where[Op.or] = [
          { first_name: { [Op.iLike]: '%' + entities.firstName + '%' } },
          { last_name: { [Op.iLike]: '%' + entities.firstName + '%' } }
        ];
      }
      try {
        const matches = await this.models.KanchoLead.findAll({ where, limit: 5 });
        if (matches.length === 1) {
          resolved.matchedLead = { id: matches[0].id, name: matches[0].first_name + ' ' + matches[0].last_name };
        } else if (matches.length > 1) {
          resolved.leadCandidates = matches.map(l => ({ id: l.id, name: l.first_name + ' ' + l.last_name, status: l.status }));
        }
      } catch (e) { }
    }

    // Fuzzy match staff
    if (entities.firstName && domain === 'staff') {
      try {
        const where = { school_id: schoolId };
        if (entities.lastName) {
          where[Op.or] = [
            { first_name: { [Op.iLike]: '%' + entities.firstName + '%' }, last_name: { [Op.iLike]: '%' + entities.lastName + '%' } }
          ];
        } else {
          where[Op.or] = [
            { first_name: { [Op.iLike]: '%' + entities.firstName + '%' } },
            { last_name: { [Op.iLike]: '%' + entities.firstName + '%' } }
          ];
        }
        const matches = await this.models.KanchoInstructor.findAll({ where, limit: 5 });
        if (matches.length === 1) {
          resolved.matchedStaff = { id: matches[0].id, name: matches[0].first_name + ' ' + matches[0].last_name };
        } else if (matches.length > 1) {
          resolved.staffCandidates = matches.map(s => ({ id: s.id, name: s.first_name + ' ' + s.last_name, role: s.role }));
        }
      } catch (e) { }
    }

    // Fuzzy match family by name
    if ((entities.firstName || entities.lastName) && domain === 'families') {
      const famName = entities.lastName || entities.firstName;
      try {
        const matches = await this.models.KanchoFamily.findAll({
          where: { school_id: schoolId, family_name: { [Op.iLike]: '%' + famName + '%' } },
          include: [{ model: this.models.KanchoStudent, as: 'members', attributes: ['id'] }],
          limit: 5
        });
        if (matches.length === 1) {
          resolved.matchedFamily = { id: matches[0].id, name: matches[0].family_name };
          resolved.recordId = matches[0].id;
        } else if (matches.length > 1) {
          resolved.familyCandidates = matches.map(f => ({ id: f.id, name: f.family_name, members: (f.members || []).length }));
        }
      } catch (e) { }
    }

    // Fuzzy match class
    if (entities.programName && ['classes', 'students'].includes(domain)) {
      try {
        const matches = await this.models.KanchoClass.findAll({
          where: { school_id: schoolId, name: { [Op.iLike]: '%' + entities.programName + '%' } }, limit: 5
        });
        if (matches.length === 1) {
          resolved.matchedClass = { id: matches[0].id, name: matches[0].name };
        } else if (matches.length > 1) {
          resolved.classCandidates = matches.map(c => { const sched = c.schedule || {}; return { id: c.id, name: c.name, day: Array.isArray(sched.days) ? sched.days.join('/') : (sched.day || ''), time: sched.time || '' }; });
        }
      } catch (e) { }
    }

    return resolved;
  }

  // ── 8. EXECUTE ─────────────────────────────────────────────
  async execute(parsed, schoolId, userId) {
    const { domain, action, intent, entities } = parsed;
    const m = this.models;

    try {
      switch (domain) {
        // ── STUDENTS ──
        case 'students': return await this._execStudents(action, entities, schoolId);
        // ── LEADS ──
        case 'leads': return await this._execLeads(action, entities, schoolId);
        // ── FAMILIES ──
        case 'families': return await this._execFamilies(action, entities, schoolId);
        // ── STAFF ──
        case 'staff': return await this._execStaff(action, entities, schoolId);
        // ── BELTS ──
        case 'belts': return await this._execBelts(action, entities, schoolId);
        // ── CLASSES ──
        case 'classes': return await this._execClasses(action, entities, schoolId);
        // ── CALENDAR ──
        case 'calendar': return await this._execCalendar(action, entities, schoolId);
        // ── PAYMENTS ──
        case 'payments': return await this._execPayments(action, entities, schoolId);
        // ── BILLING ──
        case 'billing': return await this._execBilling(action, entities, schoolId);
        // ── MERCH ──
        case 'merch': return await this._execMerch(action, entities, schoolId);
        // ── AUTOMATIONS ──
        case 'automations': return await this._execAutomations(action, entities, schoolId);
        // ── TASKS ──
        case 'tasks': return await this._execTasks(action, entities, schoolId);
        // ── FUNNELS ──
        case 'funnels': return await this._execFunnels(action, entities, schoolId);
        // ── CAMPAIGNS ──
        case 'campaigns': return await this._execCampaigns(action, entities, schoolId);
        // ── GROWTH ──
        case 'growth': return await this._execGrowth(action, entities, schoolId);
        // ── PROMOTIONS (marketing) ──
        case 'promotions': return await this._execPromotions(action, entities, schoolId);
        // ── PORTAL ──
        case 'portal': return await this._execPortal(action, entities, schoolId);
        // ── TRAINING ──
        case 'training': return await this._execTraining(action, entities, schoolId);
        default:
          return { success: false, message: "I'm not sure which area you're asking about. Try mentioning students, leads, classes, billing, etc." };
      }
    } catch (err) {
      console.error('[NLP Execute Error]', err);
      return { success: false, message: 'Something went wrong: ' + err.message };
    }
  }

  // ── DOMAIN EXECUTORS ───────────────────────────────────────

  async _execStudents(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'add_student': {
        if (!e.firstName) return { success: false, message: 'What is the student\'s name?', clarify: 'firstName' };
        const data = { school_id: schoolId, first_name: e.firstName, last_name: e.lastName || '', status: 'active', belt_rank: e.belt || 'White' };
        if (e.programName) data.membership_type = e.programName;
        const student = await m.KanchoStudent.create(data);
        return { success: true, message: `Added student ${student.first_name} ${student.last_name} (ID: ${student.id})`, data: student, affected: [student.id] };
      }
      case 'list_students':
      case 'analyze_students': {
        const where = { school_id: schoolId };
        if (e.status === 'inactive') where.status = 'inactive';
        else if (e.status === 'cancelled') where.status = 'cancelled';
        else if (e.status === 'trial') where.status = 'trial';
        else if (e.status === 'active') where.status = 'active';
        // At-risk query — status "at-risk" or "at risk" captured by entity extractor
        if (/at.?risk|churn|retain/.test(e.status || '')) {
          where.churn_risk = { [Op.in]: ['high', 'critical'] };
          delete where.status; // don't also filter by regular status when looking for at-risk
        }
        const students = await m.KanchoStudent.findAll({ where, order: [['first_name', 'ASC']], limit: 50 });
        if (students.length === 0) return { success: true, message: 'No students found matching that criteria.', data: [] };
        const summary = students.slice(0, 10).map(s => `${s.first_name} ${s.last_name} — ${s.belt_rank || 'White'}, ${s.status}`).join('\n');
        return { success: true, message: `Found ${students.length} student(s):\n${summary}${students.length > 10 ? '\n...and ' + (students.length - 10) + ' more' : ''}`, data: students };
      }
      case 'update_student': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Which student? Please provide a name or ID.', clarify: 'studentName' };
        const id = e.matchedStudent?.id || e.recordId;
        const updates = {};
        if (e.belt) updates.belt_rank = e.belt;
        if (e.status) updates.status = e.status;
        if (e.programName) updates.membership_type = e.programName;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What would you like to update? (belt, status, program, etc.)' };
        await m.KanchoStudent.update(updates, { where: { id, school_id: schoolId } });
        return { success: true, message: `Updated student ${e.matchedStudent?.name || '#' + id}: ${Object.entries(updates).map(([k, v]) => k + ' → ' + v).join(', ')}`, affected: [id] };
      }
      case 'archive_student': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Which student should I archive?', clarify: 'studentName' };
        const id = e.matchedStudent?.id || e.recordId;
        await m.KanchoStudent.update({ status: 'inactive' }, { where: { id, school_id: schoolId } });
        return { success: true, message: `Archived student ${e.matchedStudent?.name || '#' + id}`, affected: [id] };
      }
      case 'promote_belt': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Which student should be promoted?', clarify: 'studentName' };
        if (!e.belt) return { success: false, message: 'What belt rank should they be promoted to?', clarify: 'beltRank' };
        const id = e.matchedStudent?.id || e.recordId;
        const student = await m.KanchoStudent.findByPk(id);
        if (!student) return { success: false, message: 'Student not found.' };
        const fromBelt = student.belt_rank;
        await student.update({ belt_rank: e.belt });
        try { await m.KanchoPromotion.create({ school_id: schoolId, student_id: id, from_belt: fromBelt, to_belt: e.belt, promotion_date: new Date().toISOString().split('T')[0] }); } catch (err) { }
        return { success: true, message: `Promoted ${student.first_name} ${student.last_name} from ${fromBelt || 'unranked'} to ${e.belt} belt!`, affected: [id] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with students, but I\'m not sure what. Try "list students", "add student", or "promote student".' };
    }
  }

  async _execLeads(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'add_lead': {
        if (!e.firstName) return { success: false, message: 'What is the lead\'s name?', clarify: 'firstName' };
        const data = { school_id: schoolId, first_name: e.firstName, last_name: e.lastName || '', status: 'new', source: e.source || 'manual' };
        const lead = await m.KanchoLead.create(data);
        return { success: true, message: `Created lead: ${lead.first_name} ${lead.last_name} (source: ${lead.source})`, data: lead, affected: [lead.id] };
      }
      case 'list_leads': {
        const where = { school_id: schoolId };
        if (e.status) where.status = e.status;
        if (e.source) where.source = { [Op.iLike]: '%' + e.source + '%' };
        const leads = await m.KanchoLead.findAll({ where, order: [['created_at', 'DESC']], limit: 50 });
        if (leads.length === 0) return { success: true, message: 'No leads found.', data: [] };
        const summary = leads.slice(0, 10).map(l => `${l.first_name} ${l.last_name} — ${l.status} (${l.source || 'unknown'})`).join('\n');
        return { success: true, message: `Found ${leads.length} lead(s):\n${summary}`, data: leads };
      }
      case 'update_lead': {
        if (!e.matchedLead && !e.recordId) return { success: false, message: 'Which lead?', clarify: 'leadName' };
        const id = e.matchedLead?.id || e.recordId;
        const updates = {};
        if (e.status) updates.status = e.status;
        if (e.source) updates.source = e.source;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update on this lead?' };
        await m.KanchoLead.update(updates, { where: { id, school_id: schoolId } });
        return { success: true, message: `Updated lead ${e.matchedLead?.name || '#' + id}`, affected: [id] };
      }
      case 'convert_lead': {
        if (!e.matchedLead && !e.recordId) return { success: false, message: 'Which lead should I convert to a student?', clarify: 'leadName' };
        const id = e.matchedLead?.id || e.recordId;
        const lead = await m.KanchoLead.findByPk(id);
        if (!lead) return { success: false, message: 'Lead not found.' };
        const student = await m.KanchoStudent.create({ school_id: schoolId, first_name: lead.first_name, last_name: lead.last_name, email: lead.email, phone: lead.phone, status: 'active', belt_rank: 'White' });
        await lead.update({ status: 'converted', converted_to_student_id: student.id });
        return { success: true, message: `Converted lead ${lead.first_name} ${lead.last_name} to student (ID: ${student.id})`, affected: [lead.id, student.id] };
      }
      case 'archive_lead': {
        if (!e.matchedLead && !e.recordId) return { success: false, message: 'Which lead should I archive?', clarify: 'leadName' };
        const id = e.matchedLead?.id || e.recordId;
        await m.KanchoLead.update({ status: 'archived' }, { where: { id, school_id: schoolId } });
        return { success: true, message: `Archived lead ${e.matchedLead?.name || '#' + id}`, affected: [id] };
      }
      case 'assign_lead': {
        if (!e.matchedLead && !e.recordId) return { success: false, message: 'Which lead should I assign?', clarify: 'leadName' };
        if (!e.matchedStaff && !e.firstName) return { success: false, message: 'Assign to whom?' };
        const id = e.matchedLead?.id || e.recordId;
        const assignee = e.matchedStaff?.name || (e.firstName + (e.lastName ? ' ' + e.lastName : ''));
        await m.KanchoLead.update({ assigned_to: assignee }, { where: { id, school_id: schoolId } });
        return { success: true, message: `Assigned lead ${e.matchedLead?.name || '#' + id} to ${assignee}`, affected: [id] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with leads, but I\'m not sure what. Try "list leads", "add lead", or "convert lead".' };
    }
  }

  async _execFamilies(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'create_family': {
        if (!e.lastName && !e.firstName) return { success: false, message: 'What is the family name?', clarify: 'familyName' };
        const name = e.lastName || e.firstName;
        const family = await m.KanchoFamily.create({ school_id: schoolId, family_name: name, primary_contact_name: e.firstName ? (e.firstName + ' ' + (e.lastName || '')) : name });
        return { success: true, message: `Created family: ${family.family_name}`, data: family, affected: [family.id] };
      }
      case 'list_families': {
        const families = await m.KanchoFamily.findAll({ where: { school_id: schoolId }, include: [{ model: m.KanchoStudent, as: 'members', attributes: ['id'] }], limit: 50 });
        if (families.length === 0) return { success: true, message: 'No families found.', data: [] };
        const summary = families.slice(0, 10).map(f => `${f.family_name} — ${(f.members || []).length} members`).join('\n');
        return { success: true, message: `Found ${families.length} family account(s):\n${summary}`, data: families };
      }
      case 'update_family': {
        if (!e.matchedFamily && !e.recordId) return { success: false, message: 'Which family? Provide a name or ID.', clarify: 'familyName' };
        if (e.matchedFamily && !e.recordId) e.recordId = e.matchedFamily.id;
        const updates = {};
        if (e.firstName) updates.primary_contact_name = e.firstName + (e.lastName ? ' ' + e.lastName : '');
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update on this family?' };
        await m.KanchoFamily.update(updates, { where: { id: e.recordId, school_id: schoolId } });
        return { success: true, message: `Updated family ${e.matchedFamily?.name || '#' + e.recordId}`, affected: [e.recordId] };
      }
      case 'archive_family': {
        if (!e.matchedFamily && !e.recordId) return { success: false, message: 'Which family should I archive?', clarify: 'familyName' };
        const fid = e.matchedFamily?.id || e.recordId;
        await m.KanchoFamily.update({ is_active: false }, { where: { id: fid, school_id: schoolId } });
        return { success: true, message: `Archived family ${e.matchedFamily?.name || '#' + fid}`, affected: [fid] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with families, but I\'m not sure what. Try "list families" or "create family".' };
    }
  }

  async _execStaff(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'add_staff': {
        if (!e.firstName) return { success: false, message: 'What is the staff member\'s name?', clarify: 'firstName' };
        const data = { school_id: schoolId, first_name: e.firstName, last_name: e.lastName || '', role: e.role || 'instructor', is_active: true };
        const staff = await m.KanchoInstructor.create(data);
        return { success: true, message: `Added staff: ${staff.first_name} ${staff.last_name} (${staff.role})`, data: staff, affected: [staff.id] };
      }
      case 'list_staff': {
        const staff = await m.KanchoInstructor.findAll({ where: { school_id: schoolId }, order: [['first_name', 'ASC']] });
        if (staff.length === 0) return { success: true, message: 'No staff found.', data: [] };
        const summary = staff.map(s => `${s.first_name} ${s.last_name} — ${s.role} ${s.is_active ? '(active)' : '(inactive)'}`).join('\n');
        return { success: true, message: `Staff (${staff.length}):\n${summary}`, data: staff };
      }
      case 'deactivate_staff': {
        if (!e.matchedStaff && !e.recordId) return { success: false, message: 'Which staff member?', clarify: 'staffName' };
        const id = e.matchedStaff?.id || e.recordId;
        await m.KanchoInstructor.update({ is_active: false }, { where: { id, school_id: schoolId } });
        return { success: true, message: `Deactivated staff member ${e.matchedStaff?.name || '#' + id}`, affected: [id] };
      }
      case 'update_staff': {
        if (!e.matchedStaff && !e.recordId) return { success: false, message: 'Which staff member?', clarify: 'staffName' };
        const id = e.matchedStaff?.id || e.recordId;
        const updates = {};
        if (e.role) updates.role = e.role;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update? (role, etc.)' };
        await m.KanchoInstructor.update(updates, { where: { id, school_id: schoolId } });
        return { success: true, message: `Updated staff ${e.matchedStaff?.name || '#' + id}: ${Object.entries(updates).map(([k, v]) => k + ' → ' + v).join(', ')}`, affected: [id] };
      }
      case 'assign_staff': {
        if (!e.matchedStaff && !e.firstName) return { success: false, message: 'Which staff member?', clarify: 'staffName' };
        if (!e.matchedClass && !e.programName) return { success: false, message: 'Assign to which class?' };
        const staffName = e.matchedStaff?.name || (e.firstName + (e.lastName ? ' ' + e.lastName : ''));
        if (e.matchedClass) {
          await m.KanchoClass.update({ instructor: staffName }, { where: { id: e.matchedClass.id } });
          return { success: true, message: `Assigned ${staffName} to ${e.matchedClass.name}`, affected: [e.matchedClass.id] };
        }
        const cls = await m.KanchoClass.findOne({ where: { school_id: schoolId, name: { [Op.iLike]: '%' + e.programName + '%' } } });
        if (!cls) return { success: false, message: `Could not find class "${e.programName}".` };
        await cls.update({ instructor: staffName });
        return { success: true, message: `Assigned ${staffName} to ${cls.name}`, affected: [cls.id] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with staff, but I\'m not sure what. Try "list staff", "add instructor", or "assign staff".' };
    }
  }

  async _execBelts(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'promote_student':
      case 'record_promotion': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Which student should be promoted?', clarify: 'studentName' };
        if (!e.belt) return { success: false, message: 'What belt rank should they be promoted to?', clarify: 'beltRank' };
        const id = e.matchedStudent?.id || e.recordId;
        const student = await m.KanchoStudent.findByPk(id);
        if (!student) return { success: false, message: 'Student not found.' };
        const fromBelt = student.belt_rank;
        await student.update({ belt_rank: e.belt });
        try {
          await m.KanchoPromotion.create({ school_id: schoolId, student_id: id, from_belt: fromBelt, to_belt: e.belt, promotion_date: new Date().toISOString().split('T')[0], testing_score: e.amount || null });
        } catch (err) { /* promotion model may have different fields */ }
        return { success: true, message: `Promoted ${student.first_name} ${student.last_name} from ${fromBelt || 'unranked'} to ${e.belt} belt!`, affected: [id] };
      }
      case 'list_promotions':
      case 'promotion_readiness': {
        // Show students who might be ready for promotion
        const students = await m.KanchoStudent.findAll({ where: { school_id: schoolId, status: 'active' }, order: [['belt_rank', 'ASC']], limit: 50 });
        const summary = students.slice(0, 15).map(s => `${s.first_name} ${s.last_name} — ${s.belt_rank || 'White'}`).join('\n');
        return { success: true, message: `Active students by belt rank:\n${summary}`, data: students };
      }
      default:
        return { success: false, message: 'I understood you want to do something with belts/promotions, but I\'m not sure what. Try "promote [student] to [belt]" or "show students ready for testing".' };
    }
  }

  async _execClasses(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'create_class': {
        if (!e.programName && !e.firstName) return { success: false, message: 'What should the class be called?', clarify: 'className' };
        const schedule = {};
        if (e.dayOfWeek) schedule.days = [e.dayOfWeek];
        if (e.time) schedule.time = e.time;
        const data = { school_id: schoolId, name: e.programName || 'New Class', schedule, is_active: true };
        if (e.amount) data.capacity = Math.round(e.amount);
        const cls = await m.KanchoClass.create(data);
        const sched = cls.schedule || {};
        const dayStr = Array.isArray(sched.days) ? sched.days.join(', ') : '';
        return { success: true, message: `Created class: ${cls.name}${dayStr ? ' on ' + dayStr : ''}${sched.time ? ' at ' + sched.time : ''}`, data: cls, affected: [cls.id] };
      }
      case 'list_classes': {
        const classes = await m.KanchoClass.findAll({ where: { school_id: schoolId }, order: [['name', 'ASC']] });
        if (classes.length === 0) return { success: true, message: 'No classes found.', data: [] };
        const summary = classes.slice(0, 15).map(c => {
          const sched = c.schedule || {};
          const dayStr = Array.isArray(sched.days) ? sched.days.join('/') : (sched.day || '?');
          return `${c.name} — ${dayStr} ${sched.time || ''} (${c.is_active ? 'active' : 'inactive'})`;
        }).join('\n');
        return { success: true, message: `Classes (${classes.length}):\n${summary}`, data: classes };
      }
      case 'cancel_class': {
        if (!e.matchedClass && !e.recordId) return { success: false, message: 'Which class should I cancel?', clarify: 'className' };
        const id = e.matchedClass?.id || e.recordId;
        await m.KanchoClass.update({ is_active: false }, { where: { id, school_id: schoolId } });
        return { success: true, message: `Cancelled class ${e.matchedClass?.name || '#' + id}`, affected: [id] };
      }
      case 'update_class': {
        if (!e.matchedClass && !e.recordId) return { success: false, message: 'Which class should I update?', clarify: 'className' };
        const id = e.matchedClass?.id || e.recordId;
        const cls = await m.KanchoClass.findByPk(id);
        if (!cls) return { success: false, message: 'Class not found.' };
        const updates = {};
        if (e.time || e.dayOfWeek) {
          const sched = JSON.parse(JSON.stringify(cls.schedule || {}));
          if (e.time) sched.time = e.time;
          if (e.dayOfWeek) sched.days = [e.dayOfWeek];
          updates.schedule = sched;
        }
        if (e.amount) updates.capacity = Math.round(e.amount);
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update? (schedule, capacity, etc.)' };
        await m.KanchoClass.update(updates, { where: { id, school_id: schoolId } });
        return { success: true, message: `Updated class ${cls.name}: ${Object.keys(updates).join(', ')}`, affected: [id] };
      }
      case 'assign_instructor': {
        if (!e.matchedClass && !e.recordId && !e.programName) return { success: false, message: 'Which class?', clarify: 'className' };
        if (!e.matchedStaff && !e.firstName) return { success: false, message: 'Which instructor?', clarify: 'staffName' };
        const instructor = e.matchedStaff?.name || (e.firstName + (e.lastName ? ' ' + e.lastName : ''));
        let cls;
        if (e.matchedClass) cls = await m.KanchoClass.findByPk(e.matchedClass.id);
        else if (e.recordId) cls = await m.KanchoClass.findByPk(e.recordId);
        else cls = await m.KanchoClass.findOne({ where: { school_id: schoolId, name: { [Op.iLike]: '%' + e.programName + '%' } } });
        if (!cls) return { success: false, message: 'Class not found.' };
        await cls.update({ instructor });
        return { success: true, message: `Assigned ${instructor} to ${cls.name}`, affected: [cls.id] };
      }
      case 'duplicate_class': {
        if (!e.matchedClass && !e.recordId) return { success: false, message: 'Which class should I duplicate?', clarify: 'className' };
        const id = e.matchedClass?.id || e.recordId;
        const original = await m.KanchoClass.findByPk(id);
        if (!original) return { success: false, message: 'Class not found.' };
        const copy = await m.KanchoClass.create({ school_id: schoolId, name: original.name + ' (Copy)', schedule: original.schedule, duration_minutes: original.duration_minutes, capacity: original.capacity, instructor: original.instructor, program_type: original.program_type, is_active: true });
        return { success: true, message: `Duplicated class: ${copy.name}`, data: copy, affected: [copy.id] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with classes, but I\'m not sure what. Try "list classes", "create class", or "cancel class".' };
    }
  }

  async _execCalendar(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'create_event':
      case 'schedule_event': {
        const data = {
          school_id: schoolId,
          customer_name: e.firstName ? (e.firstName + ' ' + (e.lastName || '')) : 'Event',
          appointment_date: e.date || new Date().toISOString().split('T')[0],
          appointment_time: e.time || '10:00',
          purpose: e.programName || 'appointment',
          status: 'scheduled'
        };
        if (e.matchedStudent) { data.student_id = e.matchedStudent.id; data.customer_name = e.matchedStudent.name; }
        const appt = await m.KanchoAppointment.create(data);
        return { success: true, message: `Scheduled: ${data.customer_name} on ${data.appointment_date} at ${data.appointment_time}`, data: appt, affected: [appt.id] };
      }
      case 'list_events': {
        const where = { school_id: schoolId };
        if (e.date) where.appointment_date = e.date;
        const appts = await m.KanchoAppointment.findAll({ where, order: [['appointment_date', 'DESC']], limit: 20 });
        if (appts.length === 0) return { success: true, message: 'No upcoming events.', data: [] };
        const summary = appts.slice(0, 10).map(a => `${a.appointment_date} ${a.appointment_time} — ${a.customer_name} (${a.purpose || 'general'})`).join('\n');
        return { success: true, message: `Events (${appts.length}):\n${summary}`, data: appts };
      }
      case 'update_event': {
        if (!e.recordId) return { success: false, message: 'Which event? Please provide an ID.', clarify: 'eventId' };
        const appt = await m.KanchoAppointment.findByPk(e.recordId);
        if (!appt || appt.school_id !== schoolId) return { success: false, message: 'Event not found.' };
        const updates = {};
        if (e.date) updates.appointment_date = e.date;
        if (e.time) updates.appointment_time = e.time;
        if (e.status) updates.status = e.status;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update? (date, time, status)' };
        await appt.update(updates);
        return { success: true, message: `Updated event #${e.recordId}: ${Object.entries(updates).map(([k, v]) => k.replace('appointment_', '') + ' → ' + v).join(', ')}`, affected: [e.recordId] };
      }
      case 'delete_event': {
        if (!e.recordId) return { success: false, message: 'Which event should I delete? Provide an ID.', clarify: 'eventId' };
        const appt = await m.KanchoAppointment.findByPk(e.recordId);
        if (!appt || appt.school_id !== schoolId) return { success: false, message: 'Event not found.' };
        await appt.update({ status: 'cancelled' });
        return { success: true, message: `Cancelled event #${e.recordId} (${appt.customer_name} on ${appt.appointment_date})`, affected: [e.recordId] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with calendar, but I\'m not sure what. Try "list events", "schedule event", or "show events for tomorrow".' };
    }
  }

  async _execPayments(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'list_payments': {
        const where = { school_id: schoolId };
        if (e.status === 'failed') where.status = 'failed';
        else if (e.status === 'overdue' || e.status === 'past due') where.status = { [Op.in]: ['failed', 'past_due'] };
        const payments = await m.KanchoPayment.findAll({ where, order: [['payment_date', 'DESC']], limit: 30 });
        if (payments.length === 0) return { success: true, message: 'No payments found matching that criteria.', data: [] };
        const total = payments.reduce((s, p) => s + parseFloat(p.total || 0), 0);
        const summary = payments.slice(0, 10).map(p => `$${p.total} — ${p.status} (${p.payment_date || 'no date'})`).join('\n');
        return { success: true, message: `Found ${payments.length} payment(s) totaling $${total.toFixed(2)}:\n${summary}`, data: payments };
      }
      case 'payment_trends': {
        const payments = await m.KanchoPayment.findAll({ where: { school_id: schoolId }, order: [['payment_date', 'DESC']], limit: 100 });
        const completed = payments.filter(p => p.status === 'completed');
        const failed = payments.filter(p => p.status === 'failed');
        return { success: true, message: `Payment overview: ${completed.length} completed, ${failed.length} failed out of ${payments.length} total.` };
      }
      case 'retry_payment': {
        if (!e.recordId) return { success: false, message: 'Which payment should I retry? Provide a payment ID.', clarify: 'paymentId' };
        const payment = await m.KanchoPayment.findByPk(e.recordId);
        if (!payment || payment.school_id !== schoolId) return { success: false, message: 'Payment not found.' };
        await payment.update({ status: 'pending', notes: (payment.notes || '') + ' | Retry requested ' + new Date().toISOString().split('T')[0] });
        return { success: true, message: `Payment #${e.recordId} marked for retry ($${payment.total}). The billing system will process it.`, affected: [e.recordId] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with payments, but I\'m not sure what. Try "list payments", "show failed payments", or "retry payment #ID".' };
    }
  }

  async _execBilling(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'list_billing': {
        const where = { school_id: schoolId };
        if (e.status === 'overdue' || e.status === 'past due') where.status = { [Op.in]: ['past_due', 'overdue'] };
        const subs = await m.KanchoSubscription.findAll({ where, order: [['created_at', 'DESC']], limit: 30 });
        if (subs.length === 0) return { success: true, message: 'No subscriptions found.', data: [] };
        return { success: true, message: `Found ${subs.length} subscription(s).`, data: subs };
      }
      case 'pause_billing': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Whose billing should I pause?', clarify: 'studentName' };
        const studentId = e.matchedStudent?.id || e.recordId;
        await m.KanchoSubscription.update({ status: 'paused' }, { where: { school_id: schoolId, student_id: studentId, status: 'active' } });
        return { success: true, message: `Paused billing for ${e.matchedStudent?.name || 'student #' + studentId}`, affected: [studentId] };
      }
      case 'resume_billing': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Whose billing should I resume?', clarify: 'studentName' };
        const studentId = e.matchedStudent?.id || e.recordId;
        await m.KanchoSubscription.update({ status: 'active' }, { where: { school_id: schoolId, student_id: studentId, status: 'paused' } });
        return { success: true, message: `Resumed billing for ${e.matchedStudent?.name || 'student #' + studentId}`, affected: [studentId] };
      }
      case 'cancel_membership': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Whose membership should I cancel?', clarify: 'studentName' };
        const studentId = e.matchedStudent?.id || e.recordId;
        await m.KanchoSubscription.update({ status: 'cancelled' }, { where: { school_id: schoolId, student_id: studentId } });
        await m.KanchoStudent.update({ status: 'cancelled' }, { where: { id: studentId, school_id: schoolId } });
        return { success: true, message: `Cancelled membership for ${e.matchedStudent?.name || 'student #' + studentId}`, affected: [studentId] };
      }
      case 'update_subscription': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Whose subscription?', clarify: 'studentName' };
        const studentId = e.matchedStudent?.id || e.recordId;
        const updates = {};
        if (e.amount) updates.amount = e.amount;
        if (e.status) updates.status = e.status;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update on this subscription? (amount, status)' };
        await m.KanchoSubscription.update(updates, { where: { school_id: schoolId, student_id: studentId } });
        return { success: true, message: `Updated subscription for ${e.matchedStudent?.name || 'student #' + studentId}: ${Object.entries(updates).map(([k, v]) => k + ' → ' + v).join(', ')}`, affected: [studentId] };
      }
      case 'billing_report': {
        const [activeSubs, pausedSubs, totalRev] = await Promise.all([
          m.KanchoSubscription.count({ where: { school_id: schoolId, status: 'active' } }),
          m.KanchoSubscription.count({ where: { school_id: schoolId, status: 'paused' } }),
          m.KanchoPayment.findAll({ where: { school_id: schoolId, status: 'completed' }, order: [['payment_date', 'DESC']], limit: 30 })
        ]);
        const recentTotal = totalRev.reduce((s, p) => s + parseFloat(p.total || 0), 0);
        return { success: true, message: `Billing Report:\nActive subscriptions: ${activeSubs}\nPaused subscriptions: ${pausedSubs}\nRecent payments (last 30): $${recentTotal.toFixed(2)}` };
      }
      default:
        return { success: false, message: 'I understood you want to do something with billing, but I\'m not sure what. Try "list billing", "pause billing", or "billing report".' };
    }
  }

  async _execMerch(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'add_product': {
        if (!e.firstName && !e.programName) return { success: false, message: 'What product do you want to add?', clarify: 'productName' };
        const name = e.programName || (e.firstName + (e.lastName ? ' ' + e.lastName : ''));
        const product = await m.KanchoMerchandise.create({ school_id: schoolId, name, price: e.amount || 0, category: 'gear', stock_quantity: 0 });
        return { success: true, message: `Added product: ${product.name} ($${product.price})`, data: product, affected: [product.id] };
      }
      case 'list_products': {
        const products = await m.KanchoMerchandise.findAll({ where: { school_id: schoolId }, order: [['name', 'ASC']] });
        if (products.length === 0) return { success: true, message: 'No merchandise found.', data: [] };
        const lowStock = products.filter(p => (p.stock_quantity || 0) < 5);
        const summary = products.slice(0, 10).map(p => `${p.name} — $${p.price} (stock: ${p.stock_quantity || 0})`).join('\n');
        return { success: true, message: `Merchandise (${products.length})${lowStock.length ? ', ' + lowStock.length + ' low stock' : ''}:\n${summary}`, data: products };
      }
      case 'update_product': {
        if (!e.recordId) return { success: false, message: 'Which product? Provide an ID.', clarify: 'productId' };
        const product = await m.KanchoMerchandise.findByPk(e.recordId);
        if (!product || product.school_id !== schoolId) return { success: false, message: 'Product not found.' };
        const updates = {};
        if (e.amount) updates.price = e.amount;
        if (e.status) updates.status = e.status;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update? (price, stock, etc.)' };
        await product.update(updates);
        return { success: true, message: `Updated product ${product.name}: ${Object.entries(updates).map(([k, v]) => k + ' → ' + v).join(', ')}`, affected: [e.recordId] };
      }
      case 'archive_product': {
        if (!e.recordId) return { success: false, message: 'Which product should I archive?', clarify: 'productId' };
        await m.KanchoMerchandise.update({ status: 'archived' }, { where: { id: e.recordId, school_id: schoolId } });
        return { success: true, message: `Archived product #${e.recordId}`, affected: [e.recordId] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with merchandise, but I\'m not sure what. Try "list products", "add product", or "show low stock".' };
    }
  }

  async _execAutomations(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'create_automation': {
        const name = e.programName || 'New Automation';
        const auto = await m.KanchoAutomation.create({ school_id: schoolId, name, type: 'custom', trigger_type: 'event', trigger_config: {}, actions: [], is_active: true });
        return { success: true, message: `Created automation: ${auto.name}. Open the Automations tab to configure triggers and actions.`, data: auto, affected: [auto.id] };
      }
      case 'list_automations': {
        const autos = await m.KanchoAutomation.findAll({ where: { school_id: schoolId }, order: [['name', 'ASC']] });
        if (autos.length === 0) return { success: true, message: 'No automations configured.', data: [] };
        const summary = autos.map(a => `${a.name} — ${a.is_active ? 'active' : 'paused'} (${a.runs_count || 0} runs)`).join('\n');
        return { success: true, message: `Automations (${autos.length}):\n${summary}`, data: autos };
      }
      case 'pause_automation': {
        const autos = await m.KanchoAutomation.findAll({ where: { school_id: schoolId, is_active: true } });
        // Try to match by name
        const name = e.programName || e.firstName || '';
        const match = autos.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          await match.update({ is_active: false });
          return { success: true, message: `Paused automation: ${match.name}`, affected: [match.id] };
        }
        return { success: false, message: 'Which automation should I pause? Active ones:\n' + autos.map(a => a.name).join('\n') };
      }
      case 'resume_automation': {
        const autos = await m.KanchoAutomation.findAll({ where: { school_id: schoolId, is_active: false } });
        const name = e.programName || e.firstName || '';
        const match = autos.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          await match.update({ is_active: true });
          return { success: true, message: `Resumed automation: ${match.name}`, affected: [match.id] };
        }
        return { success: false, message: 'Which automation should I resume? Paused ones:\n' + autos.map(a => a.name).join('\n') };
      }
      case 'update_automation': {
        if (!e.recordId) return { success: false, message: 'Which automation? Provide an ID.', clarify: 'automationId' };
        const auto = await m.KanchoAutomation.findByPk(e.recordId);
        if (!auto || auto.school_id !== schoolId) return { success: false, message: 'Automation not found.' };
        const updates = {};
        if (e.programName) updates.name = e.programName;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update on this automation?' };
        await auto.update(updates);
        return { success: true, message: `Updated automation ${auto.name}`, affected: [e.recordId] };
      }
      case 'trigger_automation': {
        const autos = await m.KanchoAutomation.findAll({ where: { school_id: schoolId, is_active: true } });
        const name = e.programName || e.firstName || '';
        const match = name ? autos.find(a => a.name.toLowerCase().includes(name.toLowerCase())) : null;
        if (match) {
          await match.update({ runs_count: (match.runs_count || 0) + 1, last_run_at: new Date() });
          return { success: true, message: `Triggered automation: ${match.name} (run #${(match.runs_count || 0) + 1})`, affected: [match.id] };
        }
        if (autos.length === 0) return { success: false, message: 'No active automations to trigger.' };
        return { success: false, message: 'Which automation? Active: ' + autos.map(a => a.name).join(', ') };
      }
      case 'delete_automation': {
        if (!e.recordId) return { success: false, message: 'Which automation should I delete? Provide an ID.', clarify: 'automationId' };
        const auto = await m.KanchoAutomation.findByPk(e.recordId);
        if (!auto || auto.school_id !== schoolId) return { success: false, message: 'Automation not found.' };
        await auto.destroy();
        return { success: true, message: `Deleted automation: ${auto.name}`, affected: [e.recordId] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with automations, but I\'m not sure what. Try "list automations", "create automation", or "pause automation".' };
    }
  }

  async _execTasks(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'create_task': {
        const title = e.programName || (e.firstName ? 'Follow up with ' + e.firstName + (e.lastName ? ' ' + e.lastName : '') : null);
        if (!title) return { success: false, message: 'What should the task be?', clarify: 'taskTitle' };
        const task = await m.KanchoTask.create({ school_id: schoolId, title, type: 'general', priority: e.priority || 'medium', status: 'pending', due_date: e.date || null });
        return { success: true, message: `Created task: ${task.title} (${task.priority} priority)`, data: task, affected: [task.id] };
      }
      case 'list_tasks': {
        const where = { school_id: schoolId };
        if (e.status === 'overdue') { where.status = { [Op.ne]: 'completed' }; where.due_date = { [Op.lt]: new Date().toISOString().split('T')[0] }; }
        else if (e.status === 'completed') where.status = 'completed';
        else if (e.status === 'pending') where.status = 'pending';
        else if (e.status) where.status = e.status;
        // "today's tasks" — filter by today's due date
        if (e.date) where.due_date = e.date;
        const tasks = await m.KanchoTask.findAll({ where, order: [['due_date', 'ASC']], limit: 30 });
        if (tasks.length === 0) return { success: true, message: 'No tasks found.', data: [] };
        const summary = tasks.slice(0, 10).map(t => `[${t.priority}] ${t.title} — ${t.status}${t.due_date ? ' (due: ' + t.due_date + ')' : ''}`).join('\n');
        return { success: true, message: `Tasks (${tasks.length}):\n${summary}`, data: tasks };
      }
      case 'update_task': {
        if (!e.recordId) return { success: false, message: 'Which task? Provide an ID.', clarify: 'taskId' };
        const task = await m.KanchoTask.findByPk(e.recordId);
        if (!task || task.school_id !== schoolId) return { success: false, message: 'Task not found.' };
        const updates = {};
        if (e.status) updates.status = e.status;
        if (e.priority) updates.priority = e.priority;
        if (e.date) updates.due_date = e.date;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update? (status, priority, due date)' };
        await task.update(updates);
        return { success: true, message: `Updated task "${task.title}": ${Object.entries(updates).map(([k, v]) => k + ' → ' + v).join(', ')}`, affected: [e.recordId] };
      }
      case 'delete_task': {
        if (!e.recordId) return { success: false, message: 'Which task should I delete? Provide an ID.', clarify: 'taskId' };
        const task = await m.KanchoTask.findByPk(e.recordId);
        if (!task || task.school_id !== schoolId) return { success: false, message: 'Task not found.' };
        await task.destroy();
        return { success: true, message: `Deleted task: ${task.title}`, affected: [e.recordId] };
      }
      case 'assign_task': {
        if (!e.recordId) return { success: false, message: 'Which task? Provide an ID.', clarify: 'taskId' };
        if (!e.matchedStaff && !e.firstName) return { success: false, message: 'Assign to whom?' };
        const task = await m.KanchoTask.findByPk(e.recordId);
        if (!task || task.school_id !== schoolId) return { success: false, message: 'Task not found.' };
        const assignee = e.matchedStaff?.name || (e.firstName + (e.lastName ? ' ' + e.lastName : ''));
        await task.update({ assigned_to: assignee });
        return { success: true, message: `Assigned task "${task.title}" to ${assignee}`, affected: [e.recordId] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with tasks, but I\'m not sure what. Try "list tasks", "create task", or "show overdue tasks".' };
    }
  }

  async _execFunnels(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'list_funnels':
      case 'funnel_performance': {
        const funnels = await m.KanchoFunnel.findAll({ where: { school_id: schoolId } });
        if (funnels.length === 0) return { success: true, message: 'No funnels configured.', data: [] };
        const summary = funnels.map(f => `${f.name} — ${f.status || 'draft'} (${(f.stats || {}).views || 0} views, ${(f.stats || {}).submissions || 0} submissions)`).join('\n');
        return { success: true, message: `Funnels (${funnels.length}):\n${summary}`, data: funnels };
      }
      case 'create_funnel': {
        const name = e.programName || 'New Funnel';
        const funnel = await m.KanchoFunnel.create({ school_id: schoolId, name, type: 'trial_booking', status: 'draft' });
        return { success: true, message: `Created funnel: ${funnel.name}. Open Funnels tab to configure.`, data: funnel, affected: [funnel.id] };
      }
      case 'update_funnel': {
        if (!e.recordId) return { success: false, message: 'Which funnel? Provide an ID.', clarify: 'funnelId' };
        const funnel = await m.KanchoFunnel.findByPk(e.recordId);
        if (!funnel || funnel.school_id !== schoolId) return { success: false, message: 'Funnel not found.' };
        const updates = {};
        if (e.programName) updates.name = e.programName;
        if (e.status) updates.status = e.status;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update on this funnel?' };
        await funnel.update(updates);
        return { success: true, message: `Updated funnel ${funnel.name}`, affected: [e.recordId] };
      }
      case 'delete_funnel': {
        if (!e.recordId) return { success: false, message: 'Which funnel should I delete?', clarify: 'funnelId' };
        const funnel = await m.KanchoFunnel.findByPk(e.recordId);
        if (!funnel || funnel.school_id !== schoolId) return { success: false, message: 'Funnel not found.' };
        await funnel.destroy();
        return { success: true, message: `Deleted funnel: ${funnel.name}`, affected: [e.recordId] };
      }
      case 'duplicate_funnel': {
        if (!e.recordId) return { success: false, message: 'Which funnel should I duplicate?', clarify: 'funnelId' };
        const original = await m.KanchoFunnel.findByPk(e.recordId);
        if (!original || original.school_id !== schoolId) return { success: false, message: 'Funnel not found.' };
        const copy = await m.KanchoFunnel.create({ school_id: schoolId, name: original.name + ' (Copy)', type: original.type, status: 'draft', steps: original.steps });
        return { success: true, message: `Duplicated funnel: ${copy.name}`, data: copy, affected: [copy.id] };
      }
      case 'launch_funnel': {
        if (!e.recordId) {
          const funnels = await m.KanchoFunnel.findAll({ where: { school_id: schoolId, status: 'draft' } });
          const name = e.programName || e.firstName || '';
          const match = name ? funnels.find(f => f.name.toLowerCase().includes(name.toLowerCase())) : null;
          if (match) { e.recordId = match.id; }
          else return { success: false, message: 'Which funnel? Draft funnels: ' + funnels.map(f => f.name).join(', ') };
        }
        const funnel = await m.KanchoFunnel.findByPk(e.recordId);
        if (!funnel || funnel.school_id !== schoolId) return { success: false, message: 'Funnel not found.' };
        await funnel.update({ status: 'active' });
        return { success: true, message: `Launched funnel: ${funnel.name}`, affected: [e.recordId] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with funnels, but I\'m not sure what. Try "list funnels", "create funnel", or "launch funnel".' };
    }
  }

  async _execCampaigns(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'list_campaigns':
      case 'campaign_performance': {
        const campaigns = await m.KanchoCampaign.findAll({ where: { school_id: schoolId }, order: [['created_at', 'DESC']] });
        if (campaigns.length === 0) return { success: true, message: 'No campaigns yet.', data: [] };
        const summary = campaigns.map(c => `${c.name} — ${c.status} (${c.type})`).join('\n');
        return { success: true, message: `Campaigns (${campaigns.length}):\n${summary}`, data: campaigns };
      }
      case 'create_campaign': {
        const name = e.programName || 'New Campaign';
        const campaign = await m.KanchoCampaign.create({ school_id: schoolId, name, type: e.channelType || 'sms', goal: 'engagement', status: 'draft' });
        return { success: true, message: `Created campaign: ${campaign.name} (${campaign.type}). Open Campaigns tab to configure.`, data: campaign, affected: [campaign.id] };
      }
      case 'pause_campaign': {
        const campaigns = await m.KanchoCampaign.findAll({ where: { school_id: schoolId, status: 'active' } });
        const name = e.programName || e.firstName || '';
        const match = campaigns.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          await match.update({ status: 'paused' });
          return { success: true, message: `Paused campaign: ${match.name}`, affected: [match.id] };
        }
        return { success: false, message: 'Which campaign? Active: ' + campaigns.map(c => c.name).join(', ') };
      }
      case 'resume_campaign': {
        const campaigns = await m.KanchoCampaign.findAll({ where: { school_id: schoolId, status: 'paused' } });
        const name = e.programName || e.firstName || '';
        const match = name ? campaigns.find(c => c.name.toLowerCase().includes(name.toLowerCase())) : null;
        if (match) {
          await match.update({ status: 'active' });
          return { success: true, message: `Resumed campaign: ${match.name}`, affected: [match.id] };
        }
        if (campaigns.length === 0) return { success: false, message: 'No paused campaigns to resume.' };
        return { success: false, message: 'Which campaign? Paused: ' + campaigns.map(c => c.name).join(', ') };
      }
      case 'update_campaign': {
        if (!e.recordId) return { success: false, message: 'Which campaign? Provide an ID.', clarify: 'campaignId' };
        const campaign = await m.KanchoCampaign.findByPk(e.recordId);
        if (!campaign || campaign.school_id !== schoolId) return { success: false, message: 'Campaign not found.' };
        const updates = {};
        if (e.programName) updates.name = e.programName;
        if (e.channelType) updates.type = e.channelType;
        if (Object.keys(updates).length === 0) return { success: false, message: 'What should I update on this campaign?' };
        await campaign.update(updates);
        return { success: true, message: `Updated campaign ${campaign.name}`, affected: [e.recordId] };
      }
      case 'launch_campaign': {
        const campaigns = await m.KanchoCampaign.findAll({ where: { school_id: schoolId, status: { [Op.in]: ['draft', 'paused'] } } });
        const name = e.programName || e.firstName || '';
        const match = name ? campaigns.find(c => c.name.toLowerCase().includes(name.toLowerCase())) : null;
        if (match) {
          await match.update({ status: 'active' });
          return { success: true, message: `Launched campaign: ${match.name}`, affected: [match.id] };
        }
        if (campaigns.length === 0) return { success: false, message: 'No draft or paused campaigns to launch.' };
        return { success: false, message: 'Which campaign? Available: ' + campaigns.map(c => `${c.name} (${c.status})`).join(', ') };
      }
      case 'delete_campaign': {
        if (!e.recordId) return { success: false, message: 'Which campaign should I delete?', clarify: 'campaignId' };
        const campaign = await m.KanchoCampaign.findByPk(e.recordId);
        if (!campaign || campaign.school_id !== schoolId) return { success: false, message: 'Campaign not found.' };
        await campaign.destroy();
        return { success: true, message: `Deleted campaign: ${campaign.name}`, affected: [e.recordId] };
      }
      case 'duplicate_campaign': {
        if (!e.recordId) return { success: false, message: 'Which campaign should I duplicate?', clarify: 'campaignId' };
        const original = await m.KanchoCampaign.findByPk(e.recordId);
        if (!original || original.school_id !== schoolId) return { success: false, message: 'Campaign not found.' };
        const copy = await m.KanchoCampaign.create({ school_id: schoolId, name: original.name + ' (Copy)', type: original.type, goal: original.goal, status: 'draft' });
        return { success: true, message: `Duplicated campaign: ${copy.name}`, data: copy, affected: [copy.id] };
      }
      default:
        return { success: false, message: 'I understood you want to do something with campaigns, but I\'m not sure what. Try "list campaigns", "create campaign", or "launch campaign".' };
    }
  }

  async _execGrowth(action, e, schoolId) {
    const m = this.models;
    try {
      const [activeStudents, totalLeads, newLeads, atRisk, recentPayments] = await Promise.all([
        m.KanchoStudent.count({ where: { school_id: schoolId, status: 'active' } }),
        m.KanchoLead.count({ where: { school_id: schoolId } }),
        m.KanchoLead.count({ where: { school_id: schoolId, status: 'new' } }),
        m.KanchoStudent.count({ where: { school_id: schoolId, churn_risk: { [Op.in]: ['high', 'critical'] } } }),
        m.KanchoPayment.findAll({ where: { school_id: schoolId, status: 'completed' }, order: [['payment_date', 'DESC']], limit: 30 })
      ]);
      const recentRevenue = recentPayments.reduce((s, p) => s + parseFloat(p.total || 0), 0);

      switch (action) {
        case 'growth_summary':
          return {
            success: true,
            message: `Growth Summary:\n` +
              `Active students: ${activeStudents}\n` +
              `Total leads: ${totalLeads} (${newLeads} new)\n` +
              `At-risk students: ${atRisk}\n` +
              `Recent revenue (last 30 payments): $${recentRevenue.toFixed(2)}\n` +
              `Revenue at risk: ~$${(atRisk * 175).toFixed(0)}/mo`,
            data: { activeStudents, totalLeads, newLeads, atRisk, recentRevenue }
          };
        case 'growth_insights':
        default: {
          const insights = [];
          if (atRisk > 0) insights.push(`${atRisk} student(s) at high/critical churn risk — consider retention outreach`);
          if (newLeads > 0) insights.push(`${newLeads} new lead(s) awaiting follow-up`);
          const conversionRate = totalLeads > 0 ? ((activeStudents / (activeStudents + totalLeads)) * 100).toFixed(1) : '0';
          insights.push(`Estimated conversion rate: ${conversionRate}%`);
          if (atRisk > activeStudents * 0.2) insights.push(`WARNING: ${((atRisk / activeStudents) * 100).toFixed(0)}% of active students are at risk`);
          else insights.push(`Churn risk is manageable at ${activeStudents > 0 ? ((atRisk / activeStudents) * 100).toFixed(0) : 0}%`);
          return {
            success: true,
            message: `Growth Insights:\n${insights.map((ins, i) => `${i + 1}. ${ins}`).join('\n')}\n\nActive: ${activeStudents} | Leads: ${totalLeads} | At-risk: ${atRisk} | Revenue: $${recentRevenue.toFixed(2)}`,
            data: { activeStudents, totalLeads, newLeads, atRisk, recentRevenue, insights }
          };
        }
      }
    } catch (err) {
      console.error('[NLP Growth Error]', err.message);
      return { success: false, message: 'Could not load growth data: ' + err.message };
    }
  }

  async _execPromotions(action, e, schoolId) {
    // Marketing promotions use KanchoCampaign with goal='promotion' (KanchoPromotion is for belt rank changes)
    const m = this.models;
    const promoWhere = { school_id: schoolId, goal: 'promotion' };
    switch (action) {
      case 'list_promotions_marketing':
      case 'promotion_performance': {
        const promos = await m.KanchoCampaign.findAll({ where: promoWhere, order: [['created_at', 'DESC']] });
        if (promos.length === 0) return { success: true, message: 'No marketing promotions found. Use "create promotion" to add one.', data: [] };
        const summary = promos.map(p => {
          const stats = p.stats || {};
          return `${p.name} — ${p.status} (sent: ${stats.sent || 0}, opened: ${stats.opened || 0}, converted: ${stats.converted || 0})`;
        }).join('\n');
        return { success: true, message: `Marketing Promotions (${promos.length}):\n${summary}`, data: promos };
      }
      case 'create_promotion': {
        const name = e.programName || 'New Promotion';
        const promo = await m.KanchoCampaign.create({ school_id: schoolId, name, type: e.channelType || 'sms', goal: 'promotion', status: 'draft', stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0 } });
        return { success: true, message: `Created promotion: ${promo.name} (${promo.type}). Open Campaigns tab to configure.`, data: promo, affected: [promo.id] };
      }
      case 'launch_promotion': {
        const promos = await m.KanchoCampaign.findAll({ where: { ...promoWhere, status: { [Op.in]: ['draft', 'paused'] } } });
        const name = e.programName || e.firstName || '';
        const match = name ? promos.find(p => p.name.toLowerCase().includes(name.toLowerCase())) : null;
        if (match) {
          await match.update({ status: 'active' });
          return { success: true, message: `Launched promotion: ${match.name}`, affected: [match.id] };
        }
        if (promos.length === 0) return { success: false, message: 'No draft/paused promotions to launch.' };
        return { success: false, message: 'Which promotion? Available: ' + promos.map(p => `${p.name} (${p.status})`).join(', ') };
      }
      case 'pause_promotion': {
        const promos = await m.KanchoCampaign.findAll({ where: { ...promoWhere, status: 'active' } });
        const name = e.programName || e.firstName || '';
        const match = name ? promos.find(p => p.name.toLowerCase().includes(name.toLowerCase())) : null;
        if (match) {
          await match.update({ status: 'paused' });
          return { success: true, message: `Paused promotion: ${match.name}`, affected: [match.id] };
        }
        if (promos.length === 0) return { success: false, message: 'No active promotions to pause.' };
        return { success: false, message: 'Which promotion? Active: ' + promos.map(p => p.name).join(', ') };
      }
      case 'resume_promotion': {
        const promos = await m.KanchoCampaign.findAll({ where: { ...promoWhere, status: 'paused' } });
        const name = e.programName || e.firstName || '';
        const match = name ? promos.find(p => p.name.toLowerCase().includes(name.toLowerCase())) : null;
        if (match) {
          await match.update({ status: 'active' });
          return { success: true, message: `Resumed promotion: ${match.name}`, affected: [match.id] };
        }
        if (promos.length === 0) return { success: false, message: 'No paused promotions to resume.' };
        return { success: false, message: 'Which promotion? Paused: ' + promos.map(p => p.name).join(', ') };
      }
      default:
        return { success: false, message: 'I understood you want to do something with promotions, but I\'m not sure what. Try "list promotions", "create promotion", or "launch promotion".' };
    }
  }

  async _execPortal(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'portal_status': {
        try {
          const students = await m.KanchoStudent.findAll({ where: { school_id: schoolId, status: 'active' }, attributes: ['id', 'first_name', 'last_name', 'email'] });
          const withEmail = students.filter(s => s.email);
          return { success: true, message: `Portal status: ${students.length} active students, ${withEmail.length} with email (portal-eligible). Open Portal tab to manage invites.`, data: { total: students.length, eligible: withEmail.length } };
        } catch (err) {
          return { success: true, message: 'Portal management is available through the Portal tab.' };
        }
      }
      case 'resend_invite': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Which student should I resend the invite to?', clarify: 'studentName' };
        const studentId = e.matchedStudent?.id || e.recordId;
        const student = await m.KanchoStudent.findOne({ where: { id: studentId, school_id: schoolId } });
        if (!student) return { success: false, message: 'Student not found.' };
        if (!student.email) return { success: false, message: `${student.first_name} ${student.last_name} has no email on file. Add an email first.` };
        // Reset or create portal auth entry
        try {
          const token = require('crypto').randomBytes(32).toString('hex');
          const [auth, created] = await m.KanchoStudentAuth.findOrCreate({
            where: { student_id: studentId, school_id: schoolId },
            defaults: { email: student.email, first_name: student.first_name, last_name: student.last_name, phone: student.phone || '', password_hash: '', status: 'pending', email_verification_token: token }
          });
          if (!created) await auth.update({ status: 'pending', email_verification_token: token });
          return { success: true, message: `Portal invite reset for ${student.first_name} ${student.last_name} (${student.email}). They can now set up their portal account.`, affected: [studentId] };
        } catch (err) {
          return { success: false, message: 'Could not process invite: ' + err.message };
        }
      }
      case 'update_access': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Whose access should I update?', clarify: 'studentName' };
        const sid = e.matchedStudent?.id || e.recordId;
        try {
          const auth = await m.KanchoStudentAuth.findOne({ where: { student_id: sid, school_id: schoolId } });
          if (!auth) return { success: false, message: 'No portal account found for this student. Use "resend invite" to create one.' };
          const newStatus = e.status === 'suspended' ? 'suspended' : (e.status === 'active' ? 'active' : (auth.status === 'active' ? 'suspended' : 'active'));
          await auth.update({ status: newStatus });
          return { success: true, message: `Portal access ${newStatus} for ${e.matchedStudent?.name || 'student #' + sid}`, affected: [sid] };
        } catch (err) {
          return { success: false, message: 'Could not update access: ' + err.message };
        }
      }
      default:
        return { success: false, message: 'I understood you want to do something with the portal. Try "portal status", "resend invite for [student]", or open the Portal tab.' };
    }
  }

  async _execTraining(action, e, schoolId) {
    const m = this.models;
    switch (action) {
      case 'list_programs': {
        const classes = await m.KanchoClass.findAll({ where: { school_id: schoolId }, attributes: ['id', 'name', 'program_type', 'level', 'is_active'], order: [['name', 'ASC']] });
        if (classes.length === 0) return { success: true, message: 'No training programs found.', data: [] };
        const programs = [...new Set(classes.map(c => c.program_type).filter(Boolean))];
        const summary = programs.length > 0
          ? programs.map(p => `${p}: ${classes.filter(c => c.program_type === p).length} classes`).join('\n')
          : classes.map(c => `${c.name} — ${c.level || 'all levels'} (${c.is_active ? 'active' : 'inactive'})`).join('\n');
        return { success: true, message: `Training programs:\n${summary}`, data: classes };
      }
      case 'assign_program': {
        if (!e.matchedStudent && !e.recordId) return { success: false, message: 'Which student?', clarify: 'studentName' };
        if (!e.programName) return { success: false, message: 'Which program?', clarify: 'programName' };
        const id = e.matchedStudent?.id || e.recordId;
        await m.KanchoStudent.update({ membership_type: e.programName }, { where: { id, school_id: schoolId } });
        return { success: true, message: `Assigned ${e.matchedStudent?.name || 'student #' + id} to ${e.programName} program`, affected: [id] };
      }
      case 'update_program': {
        return { success: false, message: 'To update a training program, use "update class [name]" with the specific changes.' };
      }
      default:
        return { success: false, message: 'I understood you want to do something with training. Try "list programs", "assign program to [student]", or "show classes".' };
    }
  }

  // ── 9. FULL PROCESS (parse → resolve → confirm → execute → log) ─
  async process(rawText, schoolId, userId, channel = 'chat') {
    // Parse
    const parsed = this.parse(rawText);

    // Resolve entities against DB
    if (parsed.domain && !parsed.clarificationNeeded) {
      const resolved = await this.resolveEntities(parsed, schoolId);
      Object.assign(parsed.entities, resolved);
    }

    // Check if we need clarification
    if (parsed.clarificationNeeded) {
      await this._log(schoolId, userId, channel, rawText, parsed, 'clarification_needed', "I couldn't understand that fully. Could you rephrase? Try mentioning what you want to do and which area (students, leads, classes, etc.).");
      return {
        type: 'clarification',
        message: "I couldn't understand that fully. Could you rephrase? Try mentioning what you want to do and which area (students, leads, classes, etc.).",
        parsed
      };
    }

    // Check for disambiguation
    if (parsed.entities.studentCandidates || parsed.entities.leadCandidates || parsed.entities.staffCandidates || parsed.entities.classCandidates || parsed.entities.familyCandidates) {
      const candidates = parsed.entities.studentCandidates || parsed.entities.leadCandidates || parsed.entities.staffCandidates || parsed.entities.classCandidates || parsed.entities.familyCandidates;
      const msg = `I found multiple matches. Which one?\n` + candidates.map((c, i) => `${i + 1}. ${c.name} (ID: ${c.id})`).join('\n');
      await this._log(schoolId, userId, channel, rawText, parsed, 'clarification_needed', msg);
      return { type: 'disambiguation', message: msg, candidates, parsed };
    }

    // Check if confirmation needed
    if (parsed.requiresConfirmation) {
      const preview = `I'm about to: **${parsed.action.replace(/_/g, ' ')}** in ${parsed.domain}${parsed.entities.matchedStudent ? ' for ' + parsed.entities.matchedStudent.name : ''}. Confirm? (yes/no)`;
      await this._log(schoolId, userId, channel, rawText, parsed, 'awaiting_confirmation', preview);
      return { type: 'confirmation', message: preview, parsed };
    }

    // Execute
    const result = await this.execute(parsed, schoolId, userId);
    await this._log(schoolId, userId, channel, rawText, parsed, result.success ? 'executed' : 'failed', result.message, result.affected);
    return { type: 'result', ...result, parsed };
  }

  // ── AUDIT LOGGER ───────────────────────────────────────────
  async _log(schoolId, userId, channel, rawText, parsed, status, resultSummary, affectedIds) {
    try {
      if (this.models.KanchoCommandLog) {
        await this.models.KanchoCommandLog.create({
          school_id: schoolId,
          user_id: userId || null,
          channel,
          raw_text: rawText,
          parsed_intent: parsed.intent,
          parsed_domain: parsed.domain,
          parsed_action: parsed.action,
          confidence: parsed.confidence,
          entities: parsed.entities,
          parameters: {},
          confirmation_required: parsed.requiresConfirmation,
          execution_status: status,
          result_summary: (resultSummary || '').substring(0, 5000),
          affected_record_ids: affectedIds || []
        });
      }
    } catch (err) {
      console.error('[NLP Audit Log Error]', err.message);
    }
  }
}

module.exports = KanchoNLPEngine;
