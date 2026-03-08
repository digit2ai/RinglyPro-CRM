'use strict';

const { Op } = require('sequelize');
const { Contact, Project, Task, CalendarEvent, Vertical, ProjectContact, ProjectMilestone, Notification } = require('../models');
const { logActivity, createNotification } = require('./activityService');

// Intent patterns for NLP parsing
const INTENT_PATTERNS = [
  // Contact intents
  { pattern: /^(create|add|new)\s+(a\s+)?contact/i, intent: 'create_contact' },
  { pattern: /^(show|list|get|find)\s+(all\s+)?contacts/i, intent: 'list_contacts' },
  { pattern: /^(show|list|get|find)\s+contacts?\s+(linked|assigned|for|in|under)\s+(.+)/i, intent: 'filter_contacts' },
  { pattern: /^(search|find)\s+(for\s+)?contact/i, intent: 'search_contacts' },

  // Project intents
  { pattern: /^(create|add|new|start)\s+(a\s+)?project/i, intent: 'create_project' },
  { pattern: /^(show|list|get|find)\s+(all\s+)?projects/i, intent: 'list_projects' },
  { pattern: /^(show|list|get|find)\s+(all\s+)?overdue\s+projects/i, intent: 'overdue_projects' },
  { pattern: /^(show|list|get|find)\s+(all\s+)?stalled\s+projects/i, intent: 'stalled_projects' },
  { pattern: /^(show|list)\s+high[\s-]?priority\s+projects/i, intent: 'high_priority_projects' },
  { pattern: /^(move|change|update|set)\s+(project\s+)?(.+?)\s+to\s+(.+)/i, intent: 'update_project_status' },
  { pattern: /^(summarize|summary|overview)\s+(of\s+)?(high[\s-]?priority\s+)?projects/i, intent: 'summarize_projects' },

  // Task intents
  { pattern: /^(create|add|new)\s+(a\s+)?(task|reminder|follow[\s-]?up)/i, intent: 'create_task' },
  { pattern: /^(show|list|get)\s+(all\s+)?(pending\s+)?tasks/i, intent: 'list_tasks' },
  { pattern: /^(show|list|get)\s+(all\s+)?overdue\s+tasks/i, intent: 'overdue_tasks' },

  // Calendar intents
  { pattern: /^(create|add|schedule|new)\s+(a\s+)?(meeting|event|appointment|calendar)/i, intent: 'create_event' },
  { pattern: /^(show|list|get|what)\s+(are\s+)?(upcoming|this week|today|calendar)/i, intent: 'upcoming_events' },

  // Link intents
  { pattern: /^link\s+(this\s+)?contact/i, intent: 'link_contact_project' },
  { pattern: /^link\s+(.+?)\s+to\s+(project\s+)?(.+)/i, intent: 'link_contact_project' },

  // Dashboard intents
  { pattern: /^(show|get)\s+(me\s+)?(the\s+)?dashboard/i, intent: 'dashboard' },
  { pattern: /^(what|how)\s+(is|are)\s+(the\s+)?(status|stats|metrics)/i, intent: 'dashboard' },

  // Reminder intents
  { pattern: /^(remind|email)\s+(me|us)\s+(about\s+)?(.+)/i, intent: 'create_reminder' },
  { pattern: /^(show|list|get)\s+(all\s+)?reminders/i, intent: 'list_reminders' },

  // Help
  { pattern: /^(help|what can you|commands|how to)/i, intent: 'help' }
];

// Extract entities from text
function extractEntities(text) {
  const entities = {};

  // Extract name (for contacts) - "named X" or "called X" or after "contact"
  const nameMatch = text.match(/(?:named?|called?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (nameMatch) entities.name = nameMatch[1];

  // Extract project name - "project X" or "Project X"
  const projectMatch = text.match(/(?:project\s+)([A-Z][a-zA-Z0-9\s]+?)(?:\s+to\s+|\s*$|\s+under|\s+for)/i);
  if (projectMatch) entities.project_name = projectMatch[1].trim();

  // Extract vertical
  const verticalMatch = text.match(/(?:under|for|vertical|in)\s+(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:vertical)?/i);
  if (verticalMatch) entities.vertical = verticalMatch[1].trim();

  // Extract date references
  const dateMap = {
    'today': 0, 'tomorrow': 1, 'next monday': null, 'next tuesday': null,
    'next wednesday': null, 'next thursday': null, 'next friday': null,
    'next week': 7, 'in 3 days': 3, 'in a week': 7
  };

  for (const [phrase, days] of Object.entries(dateMap)) {
    if (text.toLowerCase().includes(phrase)) {
      if (days !== null) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        entities.date = date.toISOString().split('T')[0];
      } else {
        // Handle "next [weekday]"
        const weekday = phrase.replace('next ', '');
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = dayNames.indexOf(weekday);
        if (targetDay >= 0) {
          const now = new Date();
          const currentDay = now.getDay();
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7;
          now.setDate(now.getDate() + diff);
          entities.date = now.toISOString().split('T')[0];
        }
      }
      break;
    }
  }

  // Extract status
  const statusMatch = text.match(/to\s+(planning|active|in[\s_]?progress|on[\s_]?hold|completed|cancelled|review)/i);
  if (statusMatch) entities.status = statusMatch[1].toLowerCase().replace(/\s+/g, '_');

  // Extract priority
  const priorityMatch = text.match(/(high|medium|low|critical|urgent)\s*priority/i);
  if (priorityMatch) entities.priority = priorityMatch[1].toLowerCase();

  // Extract days for stalled
  const daysMatch = text.match(/(\d+)\s+days/);
  if (daysMatch) entities.days = parseInt(daysMatch[1]);

  // Extract email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) entities.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}/);
  if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 7) entities.phone = phoneMatch[0];

  return entities;
}

// Detect intent from text
function detectIntent(text) {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { intent, match };
  }
  return { intent: 'unknown', match: null };
}

// Execute NLP command
async function executeCommand(inputText, userEmail) {
  const { intent, match } = detectIntent(inputText);
  const entities = extractEntities(inputText);

  let response = '';
  let actionTaken = intent;
  let success = true;

  try {
    switch (intent) {
      case 'create_contact': {
        const parts = inputText.match(/(?:add|create|new)\s+(?:a\s+)?contact\s+(.+)/i);
        let firstName = entities.name || 'New Contact';
        let lastName = '';
        if (!entities.name && parts) {
          const words = parts[1].split(/\s+/);
          firstName = words[0] || 'New';
          lastName = words[1] || '';
        } else if (entities.name) {
          const nameParts = entities.name.split(' ');
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
        const contact = await Contact.create({
          workspace_id: 1, first_name: firstName, last_name: lastName,
          email: entities.email || null, phone: entities.phone || null,
          source: 'nlp'
        });
        await logActivity(userEmail, 'created', 'contact', contact.id, `${firstName} ${lastName}`, { via: 'nlp' });
        response = `Created contact: ${firstName} ${lastName} (ID: ${contact.id})`;
        break;
      }

      case 'list_contacts': {
        const contacts = await Contact.findAll({
          where: { workspace_id: 1, archived_at: null },
          attributes: ['id', 'first_name', 'last_name', 'email', 'status'],
          order: [['updated_at', 'DESC']],
          limit: 10
        });
        response = contacts.length > 0
          ? `Found ${contacts.length} contacts:\n` + contacts.map(c => `- ${c.first_name} ${c.last_name || ''} (${c.email || 'no email'}) [${c.status}]`).join('\n')
          : 'No contacts found.';
        break;
      }

      case 'filter_contacts': {
        const verticalName = entities.vertical || (match && match[3]);
        if (verticalName) {
          const vertical = await Vertical.findOne({
            where: { workspace_id: 1, name: { [Op.iLike]: `%${verticalName}%` } }
          });
          if (vertical) {
            const contacts = await Contact.findAll({
              where: { workspace_id: 1, vertical_id: vertical.id, archived_at: null },
              limit: 20
            });
            response = contacts.length > 0
              ? `${contacts.length} contacts in ${vertical.name}:\n` + contacts.map(c => `- ${c.first_name} ${c.last_name || ''}`).join('\n')
              : `No contacts in ${vertical.name} vertical.`;
          } else {
            response = `Vertical "${verticalName}" not found.`;
          }
        }
        break;
      }

      case 'create_project': {
        let projectName = entities.project_name;
        if (!projectName) {
          const nameMatch = inputText.match(/project\s+(?:for\s+|called\s+|named\s+)?(.+?)(?:\s+under|\s+for|\s+with|$)/i);
          projectName = nameMatch ? nameMatch[1].trim() : 'Untitled Project';
        }
        let verticalId = null;
        if (entities.vertical) {
          const v = await Vertical.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${entities.vertical}%` } } });
          if (v) verticalId = v.id;
        }
        const project = await Project.create({
          workspace_id: 1, name: projectName, vertical_id: verticalId,
          status: 'planning', priority: entities.priority || 'medium',
          start_date: new Date().toISOString().split('T')[0],
          code: projectName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase()
        });
        await logActivity(userEmail, 'created', 'project', project.id, projectName, { via: 'nlp' });
        response = `Created project: "${projectName}" (${project.code}) - Status: planning`;
        break;
      }

      case 'list_projects': {
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null },
          include: [{ model: Vertical, as: 'vertical', attributes: ['name'] }],
          order: [['updated_at', 'DESC']],
          limit: 10
        });
        response = projects.length > 0
          ? `Found ${projects.length} projects:\n` + projects.map(p => `- ${p.name} [${p.status}] ${p.priority} priority ${p.vertical ? '(' + p.vertical.name + ')' : ''}`).join('\n')
          : 'No projects found.';
        break;
      }

      case 'overdue_projects': {
        const today = new Date().toISOString().split('T')[0];
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null, due_date: { [Op.lt]: today }, status: { [Op.notIn]: ['completed', 'cancelled'] } },
          order: [['due_date', 'ASC']]
        });
        response = projects.length > 0
          ? `${projects.length} overdue projects:\n` + projects.map(p => `- ${p.name} (due: ${p.due_date}) [${p.status}]`).join('\n')
          : 'No overdue projects. Everything is on track!';
        break;
      }

      case 'stalled_projects': {
        const days = entities.days || 14;
        const cutoff = new Date(Date.now() - days * 86400000);
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null, status: { [Op.notIn]: ['completed', 'cancelled'] }, updated_at: { [Op.lt]: cutoff } },
          order: [['updated_at', 'ASC']]
        });
        response = projects.length > 0
          ? `${projects.length} stalled projects (no update in ${days} days):\n` + projects.map(p => `- ${p.name} (last update: ${p.updated_at.toISOString().split('T')[0]}) [${p.status}]`).join('\n')
          : `No stalled projects in the last ${days} days.`;
        break;
      }

      case 'high_priority_projects': {
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null, priority: { [Op.in]: ['high', 'critical'] } },
          include: [{ model: Vertical, as: 'vertical', attributes: ['name'] }],
          order: [['priority', 'ASC'], ['due_date', 'ASC NULLS LAST']]
        });
        response = projects.length > 0
          ? `${projects.length} high-priority projects:\n` + projects.map(p => `- ${p.name} [${p.priority}] ${p.status} ${p.due_date ? '(due: ' + p.due_date + ')' : ''}`).join('\n')
          : 'No high-priority projects found.';
        break;
      }

      case 'update_project_status': {
        const targetName = match && match[3] ? match[3].trim() : null;
        const newStatus = entities.status || (match && match[4] ? match[4].trim().toLowerCase().replace(/\s+/g, '_') : null);
        if (targetName && newStatus) {
          const project = await Project.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${targetName}%` } } });
          if (project) {
            const oldStatus = project.status;
            await project.update({ status: newStatus });
            await logActivity(userEmail, 'status_changed', 'project', project.id, project.name, { from: oldStatus, to: newStatus, via: 'nlp' });
            response = `Updated "${project.name}" from ${oldStatus} to ${newStatus}`;
          } else {
            response = `Project matching "${targetName}" not found.`;
          }
        } else {
          response = 'Could not parse project name or status. Try: "Move Project X to in_progress"';
        }
        break;
      }

      case 'summarize_projects': {
        const projects = await Project.findAll({ where: { workspace_id: 1, archived_at: null } });
        const byStatus = {};
        const byPriority = {};
        projects.forEach(p => {
          byStatus[p.status] = (byStatus[p.status] || 0) + 1;
          byPriority[p.priority] = (byPriority[p.priority] || 0) + 1;
        });
        response = `Project Summary (${projects.length} total):\n\nBy Status:\n` +
          Object.entries(byStatus).map(([k, v]) => `  ${k}: ${v}`).join('\n') +
          `\n\nBy Priority:\n` +
          Object.entries(byPriority).map(([k, v]) => `  ${k}: ${v}`).join('\n');
        break;
      }

      case 'create_task':
      case 'create_reminder': {
        const titleMatch = inputText.match(/(?:to|about|for)\s+(.+?)(?:\s+(?:on|by|next|tomorrow|today)|$)/i);
        const title = titleMatch ? titleMatch[1].trim() : inputText.replace(/^(create|add|remind|new)\s+(a\s+)?(task|reminder|follow[\s-]?up|me|us)\s*/i, '').trim() || 'Follow-up';
        const task = await Task.create({
          workspace_id: 1, user_email: userEmail, title,
          task_type: intent === 'create_reminder' ? 'reminder' : 'task',
          due_date: entities.date ? new Date(entities.date) : null,
          priority: entities.priority || 'medium'
        });
        await logActivity(userEmail, 'created', 'task', task.id, title, { via: 'nlp' });
        response = `Created ${task.task_type}: "${title}"${entities.date ? ' (due: ' + entities.date + ')' : ''}`;
        break;
      }

      case 'list_tasks': {
        const tasks = await Task.findAll({
          where: { workspace_id: 1, status: 'pending' },
          order: [['due_date', 'ASC NULLS LAST']],
          limit: 10
        });
        response = tasks.length > 0
          ? `${tasks.length} pending tasks:\n` + tasks.map(t => `- ${t.title} [${t.priority}] ${t.due_date ? '(due: ' + t.due_date.toISOString().split('T')[0] + ')' : ''}`).join('\n')
          : 'No pending tasks.';
        break;
      }

      case 'overdue_tasks': {
        const tasks = await Task.findAll({
          where: { workspace_id: 1, status: 'pending', due_date: { [Op.lt]: new Date() } },
          order: [['due_date', 'ASC']]
        });
        response = tasks.length > 0
          ? `${tasks.length} overdue tasks:\n` + tasks.map(t => `- ${t.title} (due: ${t.due_date.toISOString().split('T')[0]})`).join('\n')
          : 'No overdue tasks!';
        break;
      }

      case 'create_event': {
        const titleMatch = inputText.match(/(?:meeting|event|appointment|calendar)\s+(?:with\s+|for\s+|about\s+)?(.+?)(?:\s+(?:on|at|next|tomorrow)|$)/i);
        const title = titleMatch ? titleMatch[1].trim() : 'New Event';
        const startDate = entities.date ? new Date(entities.date + 'T10:00:00') : new Date(Date.now() + 86400000);
        const event = await CalendarEvent.create({
          workspace_id: 1, user_email: userEmail, title,
          start_time: startDate, end_time: new Date(startDate.getTime() + 3600000),
          event_type: 'meeting'
        });
        await logActivity(userEmail, 'created', 'calendar_event', event.id, title, { via: 'nlp' });
        response = `Scheduled: "${title}" on ${startDate.toISOString().split('T')[0]}`;
        break;
      }

      case 'upcoming_events': {
        const now = new Date();
        const weekLater = new Date(now.getTime() + 7 * 86400000);
        const events = await CalendarEvent.findAll({
          where: { workspace_id: 1, start_time: { [Op.between]: [now, weekLater] } },
          order: [['start_time', 'ASC']],
          limit: 10
        });
        response = events.length > 0
          ? `${events.length} upcoming events:\n` + events.map(e => `- ${e.title} (${e.start_time.toISOString().split('T')[0]}) [${e.event_type}]`).join('\n')
          : 'No upcoming events this week.';
        break;
      }

      case 'link_contact_project': {
        response = 'To link a contact to a project, use the project detail view and click "Add Contact", or provide: "Link [contact name] to project [project name]"';
        // Try to parse and link
        const linkMatch = inputText.match(/link\s+(.+?)\s+to\s+(?:project\s+)?(.+)/i);
        if (linkMatch) {
          const contactName = linkMatch[1].trim();
          const projectName = linkMatch[2].trim();
          const contact = await Contact.findOne({ where: { workspace_id: 1, first_name: { [Op.iLike]: `%${contactName}%` } } });
          const project = await Project.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${projectName}%` } } });
          if (contact && project) {
            await ProjectContact.findOrCreate({ where: { project_id: project.id, contact_id: contact.id }, defaults: { project_id: project.id, contact_id: contact.id } });
            await logActivity(userEmail, 'linked_contact', 'project', project.id, project.name, { contact_id: contact.id, via: 'nlp' });
            response = `Linked "${contact.first_name} ${contact.last_name || ''}" to project "${project.name}"`;
          } else {
            response = `Could not find ${!contact ? 'contact "' + contactName + '"' : 'project "' + projectName + '"'}`;
          }
        }
        break;
      }

      case 'list_reminders': {
        const reminders = await Task.findAll({
          where: { workspace_id: 1, task_type: 'reminder', status: 'pending' },
          order: [['due_date', 'ASC NULLS LAST']],
          limit: 10
        });
        response = reminders.length > 0
          ? `${reminders.length} pending reminders:\n` + reminders.map(r => `- ${r.title} ${r.due_date ? '(due: ' + r.due_date.toISOString().split('T')[0] + ')' : ''}`).join('\n')
          : 'No pending reminders.';
        break;
      }

      case 'help': {
        response = `Available commands:\n
- "Create a new contact named John Doe"
- "Add a project for healthcare outreach under Healthcare"
- "Show overdue projects"
- "Show stalled projects with no update in 14 days"
- "List contacts linked to the motorsport vertical"
- "Move Project Aurora to in_progress"
- "Create a reminder to follow up with John next Tuesday"
- "Show high-priority projects"
- "Summarize projects"
- "Schedule a meeting with client tomorrow"
- "Show upcoming events"
- "Link Maria to project Titan"
- "Show all pending tasks"`;
        break;
      }

      default:
        response = `I didn't understand that command. Type "help" to see available commands.\n\nYou said: "${inputText}"`;
        success = false;
    }
  } catch (err) {
    console.error('[D2AI NLP] Execution error:', err);
    response = `Error executing command: ${err.message}`;
    success = false;
  }

  return { intent, entities, actionTaken, response, success };
}

module.exports = { executeCommand, detectIntent, extractEntities };
