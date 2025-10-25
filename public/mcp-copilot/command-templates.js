// Command Templates with Dynamic Form Fields
// Streamlined version with essential GHL functions only

const COMMAND_TEMPLATES = {
  // ===== CONTACTS =====
  contacts: {
    category: 'Contacts',
    icon: '📇',
    commands: [
      {
        id: 'create_contact',
        label: 'Create Contact',
        icon: '➕',
        description: 'Add a new contact to your CRM',
        fields: [
          { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'John Doe' },
          { name: 'email', label: 'Email', type: 'email', required: false, placeholder: 'john@example.com' },
          { name: 'phone', label: 'Phone', type: 'tel', required: false, placeholder: '5551234567' }
        ],
        buildCommand: (data) => `create contact ${data.name} email ${data.email || ''} phone ${data.phone || ''}`
      },
      {
        id: 'update_contact',
        label: 'Update Contact',
        icon: '✏️',
        description: 'Update contact information',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'field', label: 'Field to Update', type: 'select', required: true, options: ['phone', 'email', 'firstName', 'lastName', 'address', 'city', 'state', 'postalCode', 'country'] },
          { name: 'value', label: 'New Value', type: 'text', required: true, placeholder: 'New value' }
        ],
        buildCommand: (data) => `update ${data.field} of contact ${data.identifier} to ${data.value}`
      },
      {
        id: 'add_tag',
        label: 'Add Tag',
        icon: '🏷️',
        description: 'Add a tag to a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'Hot Lead' }
        ],
        buildCommand: (data) => `add tag ${data.tag} to contact ${data.identifier}`
      },
      {
        id: 'remove_tag',
        label: 'Remove Tag',
        icon: '🏷️',
        description: 'Remove a tag from a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'Hot Lead' }
        ],
        buildCommand: (data) => `remove tag ${data.tag} from contact ${data.identifier}`
      },
      {
        id: 'search_contacts',
        label: 'Search Contacts',
        icon: '🔍',
        description: 'Search for contacts by name, email, or phone',
        fields: [
          { name: 'query', label: 'Search Query', type: 'text', required: true, placeholder: 'john@example.com or John Doe' }
        ],
        buildCommand: (data) => `search contacts ${data.query}`
      },
      {
        id: 'list_all_contacts',
        label: 'List All Contacts',
        icon: '📋',
        description: 'Show all contacts in your CRM',
        fields: [],
        buildCommand: () => 'list all contacts'
      },
      {
        id: 'add_note',
        label: 'Add Note',
        icon: '📝',
        description: 'Add a note to a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'note', label: 'Note', type: 'textarea', required: true, placeholder: 'Follow up next week...' }
        ],
        buildCommand: (data) => `add note to contact ${data.identifier}: ${data.note}`
      }
    ]
  },

  // ===== MESSAGING =====
  messaging: {
    category: 'Messaging',
    icon: '💬',
    commands: [
      {
        id: 'send_sms',
        label: 'Send SMS',
        icon: '📱',
        description: 'Send an SMS to a contact',
        fields: [
          { name: 'recipient', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com or 5551234567' },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Your message here...' }
        ],
        buildCommand: (data) => `send sms to ${data.recipient} saying: ${data.message}`
      },
      {
        id: 'send_email',
        label: 'Send Email',
        icon: '📧',
        description: 'Send an email to a contact',
        fields: [
          { name: 'recipient', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Email subject' },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Email body...' }
        ],
        buildCommand: (data) => `send email to ${data.recipient} subject ${data.subject} body: ${data.message}`
      },
      {
        id: 'reply_last_message',
        label: 'Reply to Last Message',
        icon: '↩️',
        description: 'Reply to the last message from a contact',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'message', label: 'Reply Message', type: 'textarea', required: true, placeholder: 'Your reply...' }
        ],
        buildCommand: (data) => `reply to last message from ${data.contact}: ${data.message}`
      },
      {
        id: 'show_messages',
        label: 'Show Messages',
        icon: '📬',
        description: 'Show message history with a contact',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `show messages with ${data.contact}`
      },
      {
        id: 'broadcast_message',
        label: 'Broadcast Message',
        icon: '📢',
        description: 'Send a message to multiple contacts with a specific tag',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'Hot Lead' },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Your broadcast message...' },
          { name: 'type', label: 'Message Type', type: 'select', required: true, options: ['SMS', 'Email'] }
        ],
        buildCommand: (data) => `broadcast ${data.type} to tag ${data.tag}: ${data.message}`
      },
      {
        id: 'schedule_message',
        label: 'Schedule Message',
        icon: '⏰',
        description: 'Schedule a message to be sent later',
        fields: [
          { name: 'recipient', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'datetime', label: 'Send Date/Time', type: 'datetime-local', required: true },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Your message...' }
        ],
        buildCommand: (data) => `schedule message to ${data.recipient} at ${data.datetime}: ${data.message}`
      }
    ]
  },

  // ===== APPOINTMENTS =====
  appointments: {
    category: 'Appointments',
    icon: '📅',
    commands: [
      {
        id: 'book_appointment',
        label: 'Book Appointment',
        icon: '📅',
        description: 'Schedule a new appointment',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'title', label: 'Appointment Title', type: 'text', required: true, placeholder: 'Sales Call' },
          { name: 'datetime', label: 'Date/Time', type: 'datetime-local', required: true },
          { name: 'duration', label: 'Duration (minutes)', type: 'number', required: false, placeholder: '30' }
        ],
        buildCommand: (data) => `book appointment with ${data.contact} titled ${data.title} on ${data.datetime} for ${data.duration || '30'} minutes`
      },
      {
        id: 'reschedule_appointment',
        label: 'Reschedule Appointment',
        icon: '🔄',
        description: 'Change the time of an existing appointment',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'datetime', label: 'New Date/Time', type: 'datetime-local', required: true }
        ],
        buildCommand: (data) => `reschedule appointment with ${data.contact} to ${data.datetime}`
      },
      {
        id: 'cancel_appointment',
        label: 'Cancel Appointment',
        icon: '❌',
        description: 'Cancel an existing appointment',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `cancel appointment with ${data.contact}`,
        confirmMessage: 'Are you sure you want to cancel this appointment?'
      },
      {
        id: 'show_appointments',
        label: 'Show Appointments',
        icon: '📋',
        description: 'View upcoming appointments',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'this week', 'this month', 'all'] }
        ],
        buildCommand: (data) => `show appointments ${data.period}`
      },
      {
        id: 'add_reminder',
        label: 'Add Reminder',
        icon: '⏰',
        description: 'Add a reminder for a contact',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'datetime', label: 'Reminder Date/Time', type: 'datetime-local', required: true },
          { name: 'message', label: 'Reminder Message', type: 'text', required: true, placeholder: 'Follow up on proposal' }
        ],
        buildCommand: (data) => `add reminder for ${data.contact} at ${data.datetime}: ${data.message}`
      }
    ]
  },

  // ===== DEALS & PIPELINES =====
  deals: {
    category: 'Deals & Pipelines',
    icon: '💰',
    commands: [
      {
        id: 'create_deal',
        label: 'Create Deal',
        icon: '➕',
        description: 'Create a new deal/opportunity',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'title', label: 'Deal Title', type: 'text', required: true, placeholder: 'Website Redesign' },
          { name: 'value', label: 'Deal Value ($)', type: 'number', required: true, placeholder: '5000' },
          { name: 'pipeline', label: 'Pipeline Name', type: 'text', required: false, placeholder: 'Sales Pipeline' }
        ],
        buildCommand: (data) => `create deal ${data.title} for contact ${data.contact} value $${data.value}${data.pipeline ? ` in pipeline ${data.pipeline}` : ''}`
      },
      {
        id: 'update_deal_amount',
        label: 'Update Deal Amount',
        icon: '💵',
        description: 'Change the value of an existing deal',
        fields: [
          { name: 'identifier', label: 'Deal Title or Contact', type: 'text', required: true, placeholder: 'Website Redesign' },
          { name: 'amount', label: 'New Amount ($)', type: 'number', required: true, placeholder: '7500' }
        ],
        buildCommand: (data) => `update deal ${data.identifier} amount to $${data.amount}`
      },
      {
        id: 'deals_by_stage',
        label: 'Deals by Stage',
        icon: '📊',
        description: 'Show deals in a specific pipeline stage',
        fields: [
          { name: 'stage', label: 'Stage Name', type: 'text', required: true, placeholder: 'Proposal Sent' }
        ],
        buildCommand: (data) => `show deals in stage ${data.stage}`
      },
      {
        id: 'won_deals',
        label: 'Show Won Deals',
        icon: '🏆',
        description: 'View all won deals',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: false, options: ['this week', 'this month', 'this year', 'all time'] }
        ],
        buildCommand: (data) => `show won deals ${data.period || 'all time'}`
      },
      {
        id: 'lost_deals',
        label: 'Show Lost Deals',
        icon: '📉',
        description: 'View all lost deals',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: false, options: ['this week', 'this month', 'this year', 'all time'] }
        ],
        buildCommand: (data) => `show lost deals ${data.period || 'all time'}`
      },
      {
        id: 'pipeline_summary',
        label: 'Pipeline Summary',
        icon: '📊',
        description: 'Get an overview of your sales pipeline',
        fields: [
          { name: 'pipeline', label: 'Pipeline Name (optional)', type: 'text', required: false, placeholder: 'Sales Pipeline' }
        ],
        buildCommand: (data) => `show pipeline summary${data.pipeline ? ` for ${data.pipeline}` : ''}`
      }
    ]
  },

  // ===== WORKFLOWS & CAMPAIGNS =====
  workflows: {
    category: 'Workflows & Campaigns',
    icon: '⚙️',
    commands: [
      {
        id: 'create_workflow',
        label: 'Create Workflow',
        icon: '➕',
        description: 'Create a new automation workflow',
        fields: [
          { name: 'name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'New Lead Follow-up' },
          { name: 'trigger', label: 'Trigger', type: 'select', required: true, options: ['Tag Added', 'Form Submitted', 'Contact Created', 'Deal Stage Changed'] }
        ],
        buildCommand: (data) => `create workflow ${data.name} triggered by ${data.trigger}`
      },
      {
        id: 'activate_workflow',
        label: 'Activate Workflow',
        icon: '▶️',
        description: 'Turn on a workflow',
        fields: [
          { name: 'name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'New Lead Follow-up' }
        ],
        buildCommand: (data) => `activate workflow ${data.name}`
      },
      {
        id: 'pause_workflow',
        label: 'Pause Workflow',
        icon: '⏸️',
        description: 'Turn off a workflow',
        fields: [
          { name: 'name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'New Lead Follow-up' }
        ],
        buildCommand: (data) => `pause workflow ${data.name}`
      },
      {
        id: 'add_to_campaign',
        label: 'Add to Campaign',
        icon: '📢',
        description: 'Add a contact to a marketing campaign',
        fields: [
          { name: 'contact', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'campaign', label: 'Campaign Name', type: 'text', required: true, placeholder: 'Holiday Promotion' }
        ],
        buildCommand: (data) => `add contact ${data.contact} to campaign ${data.campaign}`
      }
    ]
  },

  // ===== REPORTS & INSIGHTS =====
  reports: {
    category: 'Reports & Insights',
    icon: '📊',
    commands: [
      {
        id: 'account_info',
        label: 'Account Info',
        icon: '📊',
        description: 'View your GHL account information',
        fields: [],
        buildCommand: () => 'show account info'
      },
      {
        id: 'total_leads',
        label: 'Total Leads',
        icon: '📈',
        description: 'Show total number of contacts/leads',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: false, options: ['today', 'this week', 'this month', 'all time'] }
        ],
        buildCommand: (data) => `show total leads ${data.period || 'all time'}`
      },
      {
        id: 'total_calls',
        label: 'Total Calls',
        icon: '📞',
        description: 'Show total number of calls made',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: false, options: ['today', 'this week', 'this month', 'all time'] }
        ],
        buildCommand: (data) => `show total calls ${data.period || 'all time'}`
      },
      {
        id: 'conversion_rate',
        label: 'Conversion Rate',
        icon: '📊',
        description: 'View lead to customer conversion rate',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: false, options: ['this week', 'this month', 'this year', 'all time'] }
        ],
        buildCommand: (data) => `show conversion rate ${data.period || 'this month'}`
      },
      {
        id: 'revenue_by_stage',
        label: 'Revenue by Stage',
        icon: '💰',
        description: 'Show revenue breakdown by pipeline stage',
        fields: [
          { name: 'pipeline', label: 'Pipeline Name (optional)', type: 'text', required: false, placeholder: 'Sales Pipeline' }
        ],
        buildCommand: (data) => `show revenue by stage${data.pipeline ? ` for ${data.pipeline}` : ''}`
      }
    ]
  }
};
