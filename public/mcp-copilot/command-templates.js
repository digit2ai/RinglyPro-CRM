// Command Templates with Dynamic Form Fields
// Streamlined version with essential GHL functions only

const COMMAND_TEMPLATES = {
  // ===== CONTACTS =====
  // NOTE: Contact operations now use the Conversational Agent
  // Just type naturally: "create contact", "update contact", "add tag", etc.
  // The agent will guide you through each step with questions.
  contacts: {
    category: 'Contacts',
    icon: '📇',
    commands: [
      {
        id: 'contact_help',
        label: 'How to Use Contact Commands',
        icon: '💡',
        description: 'Learn how to use the conversational agent for contacts',
        fields: [],
        buildCommand: () => `💡 **How to Manage Contacts**

Just type what you want to do in plain language, and I'll guide you through the steps:

**Create a Contact:**
Type: "create contact"
→ I'll ask for name, phone, and email

**Update a Contact:**
Type: "update contact"
→ I'll ask which contact and what to update

**Add/Remove Tags:**
Type: "add tag" or "remove tag"
→ I'll ask which contact and tag name

**Send SMS/Email:**
Type: "send sms" or "send email"
→ I'll ask which contact and message

**Search Contacts:**
Type: "search contacts John" or "find john@example.com"
→ I'll show matching contacts

**Cancel Anytime:**
Type "cancel" at any step to stop

Examples:
• "create contact"
• "update contact"
• "add tag to contact"
• "send sms"
• "search contacts john@example.com"`
      }
    ]
  },

  // ===== MESSAGING =====
  // NOTE: SMS and Email now use the Conversational Agent
  // Just type "send sms" or "send email" and I'll guide you
  messaging: {
    category: 'Messaging',
    icon: '💬',
    commands: [
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
