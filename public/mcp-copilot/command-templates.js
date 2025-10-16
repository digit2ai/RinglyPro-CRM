// Command Templates with Dynamic Form Fields
// Each command has fields that users fill in through a form UI

const COMMAND_TEMPLATES = {
  // ===== CONTACTS & PEOPLE =====
  contacts: {
    category: 'Contacts & People',
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
          { name: 'identifier', label: 'Email or Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'field', label: 'Field to Update', type: 'select', required: true, options: ['phone', 'email', 'firstName', 'lastName'] },
          { name: 'value', label: 'New Value', type: 'text', required: true, placeholder: 'New value' }
        ],
        buildCommand: (data) => `update contact ${data.identifier} ${data.field} ${data.value}`
      },
      {
        id: 'delete_contact',
        label: 'Delete Contact',
        icon: '🗑️',
        description: 'Permanently delete a contact',
        fields: [
          { name: 'identifier', label: 'Email, Phone, or Name', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `delete contact ${data.identifier}`,
        confirmMessage: 'Are you sure you want to delete this contact? This cannot be undone.'
      },
      {
        id: 'search_contacts',
        label: 'Search Contacts',
        icon: '🔍',
        description: 'Find contacts by name, email, or phone',
        fields: [
          { name: 'query', label: 'Search For', type: 'text', required: true, placeholder: 'John or john@example.com' }
        ],
        buildCommand: (data) => `search ${data.query}`
      },
      {
        id: 'list_contacts',
        label: 'List All Contacts',
        icon: '📋',
        description: 'Show all contacts in your CRM',
        fields: [],
        buildCommand: () => `list contacts`
      },
      {
        id: 'contacts_by_period',
        label: 'Contacts by Time Period',
        icon: '📅',
        description: 'Show contacts added in a time period',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'yesterday', 'this week', 'last week', 'this month', 'last month'] }
        ],
        buildCommand: (data) => `show contacts added ${data.period}`
      },
      {
        id: 'contacts_missing_field',
        label: 'Find Missing Fields',
        icon: '🔍',
        description: 'Find contacts missing specific data',
        fields: [
          { name: 'field', label: 'Missing Field', type: 'select', required: true, options: ['email', 'phone', 'name', 'tags'] }
        ],
        buildCommand: (data) => `find contacts missing ${data.field}`
      },
      {
        id: 'add_note',
        label: 'Add Note',
        icon: '📝',
        description: 'Add a note to a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'note', label: 'Note Content', type: 'textarea', required: true, placeholder: 'Customer interested in premium package...' }
        ],
        buildCommand: (data) => `add note to ${data.identifier}: ${data.note}`
      },
      {
        id: 'add_tag',
        label: 'Add Tag',
        icon: '🏷️',
        description: 'Add a tag to a contact',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'vip' },
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `add tag ${data.tag} to ${data.identifier}`
      },
      {
        id: 'remove_tag',
        label: 'Remove Tag',
        icon: '🏷️',
        description: 'Remove a tag from a contact',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'vip' },
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `remove tag ${data.tag} from ${data.identifier}`
      }
    ]
  },

  // ===== CONVERSATIONS & MESSAGING =====
  messaging: {
    category: 'Conversations & Messaging',
    icon: '💬',
    commands: [
      {
        id: 'send_sms',
        label: 'Send SMS',
        icon: '📱',
        description: 'Send a text message to a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Your appointment is confirmed for tomorrow at 2pm' }
        ],
        buildCommand: (data) => `send sms to ${data.identifier} saying ${data.message}`
      },
      {
        id: 'send_email',
        label: 'Send Email',
        icon: '📧',
        description: 'Send an email to a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email', type: 'email', required: true, placeholder: 'john@example.com' },
          { name: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Welcome to our service' },
          { name: 'body', label: 'Message Body', type: 'textarea', required: true, placeholder: 'Thank you for joining...' }
        ],
        buildCommand: (data) => `email ${data.identifier} subject ${data.subject} body ${data.body}`
      }
    ]
  },

  // ===== TASKS & NOTES =====
  tasks: {
    category: 'Tasks & Notes',
    icon: '✅',
    commands: [
      {
        id: 'create_task',
        label: 'Create Task',
        icon: '✅',
        description: 'Create a task for a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'task', label: 'Task Description', type: 'textarea', required: true, placeholder: 'Follow up on proposal and send pricing' }
        ],
        buildCommand: (data) => `create task for ${data.identifier}: ${data.task}`
      },
      {
        id: 'list_tasks',
        label: 'List Tasks',
        icon: '📋',
        description: 'Show tasks for a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `list tasks for ${data.identifier}`
      }
    ]
  },

  // ===== APPOINTMENTS & CALENDAR =====
  appointments: {
    category: 'Appointments & Calendar',
    icon: '📅',
    commands: [
      {
        id: 'book_appointment',
        label: 'Book Appointment',
        icon: '📅',
        description: 'Schedule an appointment with a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'datetime', label: 'Date & Time', type: 'text', required: true, placeholder: 'tomorrow at 2pm' }
        ],
        buildCommand: (data) => `book appointment for ${data.identifier} ${data.datetime}`
      },
      {
        id: 'show_calendars',
        label: 'Show Calendars',
        icon: '📅',
        description: 'List all available calendars',
        fields: [],
        buildCommand: () => `show calendars`
      },
      {
        id: 'set_reminder',
        label: 'Set Reminder',
        icon: '⏰',
        description: 'Set a reminder for a contact',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'time', label: 'Reminder Time', type: 'text', required: true, placeholder: 'tomorrow at 10am' }
        ],
        buildCommand: (data) => `set reminder for ${data.identifier} ${data.time}`
      }
    ]
  },

  // ===== PIPELINES & OPPORTUNITIES =====
  pipelines: {
    category: 'Pipelines & Opportunities',
    icon: '💰',
    commands: [
      {
        id: 'show_opportunities',
        label: 'Show Opportunities',
        icon: '💰',
        description: 'List all opportunities/deals',
        fields: [],
        buildCommand: () => `show opportunities`
      },
      {
        id: 'show_pipelines',
        label: 'Show Pipelines',
        icon: '📊',
        description: 'List all pipelines',
        fields: [],
        buildCommand: () => `show pipelines`
      }
    ]
  },

  // ===== WORKFLOWS & CAMPAIGNS =====
  workflows: {
    category: 'Workflows & Campaigns',
    icon: '🔄',
    commands: [
      {
        id: 'add_to_workflow',
        label: 'Add to Workflow',
        icon: '🔄',
        description: 'Enroll contact in a workflow',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'workflow_id', label: 'Workflow ID', type: 'text', required: true, placeholder: 'abc123' }
        ],
        buildCommand: (data) => `add ${data.identifier} to workflow ${data.workflow_id}`
      },
      {
        id: 'add_to_campaign',
        label: 'Add to Campaign',
        icon: '📢',
        description: 'Add contact to a campaign',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'campaign_id', label: 'Campaign ID', type: 'text', required: true, placeholder: 'welcome' }
        ],
        buildCommand: (data) => `add ${data.identifier} to campaign ${data.campaign_id}`
      }
    ]
  },

  // ===== SYSTEM & INFO =====
  system: {
    category: 'System & Info',
    icon: '📊',
    commands: [
      {
        id: 'show_dashboard',
        label: 'Show Dashboard',
        icon: '📊',
        description: 'View dashboard summary',
        fields: [],
        buildCommand: () => `show dashboard`
      },
      {
        id: 'show_location',
        label: 'Show Location',
        icon: '📍',
        description: 'View location information',
        fields: [],
        buildCommand: () => `show location`
      }
    ]
  },

  // ===== REVIEWS =====
  reviews: {
    category: 'Reviews',
    icon: '⭐',
    commands: [
      {
        id: 'request_review',
        label: 'Request Review',
        icon: '⭐',
        description: 'Ask a contact for a review',
        fields: [
          { name: 'identifier', label: 'Contact Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `request review from ${data.identifier}`
      }
    ]
  },

  // ===== SOCIAL MEDIA =====
  social: {
    category: 'Social Media',
    icon: '📱',
    commands: [
      {
        id: 'schedule_social_post',
        label: 'Schedule Social Post',
        icon: '📱',
        description: 'Schedule a social media post',
        fields: [
          { name: 'time', label: 'When to Post', type: 'text', required: true, placeholder: 'tomorrow' },
          { name: 'content', label: 'Post Content', type: 'textarea', required: true, placeholder: 'Check out our new product!' }
        ],
        buildCommand: (data) => `schedule social post for ${data.time}: ${data.content}`
      },
      {
        id: 'list_social_posts',
        label: 'List Social Posts',
        icon: '📋',
        description: 'Show scheduled social media posts',
        fields: [],
        buildCommand: () => `list social posts`
      }
    ]
  }
};
