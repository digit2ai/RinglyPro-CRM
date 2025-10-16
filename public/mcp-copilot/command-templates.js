// Command Templates with Dynamic Form Fields
// Each command has fields that users fill in through a form UI

const COMMAND_TEMPLATES = {
  // ===== CONTACTS & PEOPLE / CRM =====
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
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'field', label: 'Field to Update', type: 'select', required: true, options: ['phone', 'email', 'firstName', 'lastName', 'address', 'city', 'state', 'postalCode', 'country'] },
          { name: 'value', label: 'New Value', type: 'text', required: true, placeholder: 'New value' }
        ],
        buildCommand: (data) => `update ${data.field} of contact ${data.identifier} to ${data.value}`
      },
      {
        id: 'delete_contact',
        label: 'Delete Contact',
        icon: '🗑️',
        description: 'Permanently delete a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `delete contact ${data.identifier}`,
        confirmMessage: 'Are you sure you want to delete this contact? This cannot be undone.'
      },
      {
        id: 'merge_duplicates',
        label: 'Merge Duplicates',
        icon: '🔗',
        description: 'Merge duplicate contacts',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `merge duplicates for contact ${data.identifier}`
      },
      {
        id: 'add_note',
        label: 'Add Note',
        icon: '📝',
        description: 'Add a note to a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'note', label: 'Note Content', type: 'textarea', required: true, placeholder: 'Customer interested in premium package...' }
        ],
        buildCommand: (data) => `add note to ${data.identifier} saying ${data.note}`
      },
      {
        id: 'contacts_by_period',
        label: 'Contacts by Time',
        icon: '📅',
        description: 'Show contacts added in a time period',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'yesterday', 'this week', 'last week', 'this month', 'last month', 'this year'] }
        ],
        buildCommand: (data) => `show all contacts added in ${data.period}`
      },
      {
        id: 'contacts_with_tag',
        label: 'Contacts with Tag',
        icon: '🏷️',
        description: 'Show contacts with specific tag',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'vip' }
        ],
        buildCommand: (data) => `show all contacts with tag ${data.tag}`
      },
      {
        id: 'add_tag',
        label: 'Add Tag',
        icon: '🏷️',
        description: 'Add a tag to contacts',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'vip' },
          { name: 'identifier', label: 'Contact Name/Email (optional for all)', type: 'text', required: false, placeholder: 'john@example.com or leave blank for all' }
        ],
        buildCommand: (data) => data.identifier ? `tag contact ${data.identifier} with ${data.tag}` : `tag contacts ${data.tag}`
      },
      {
        id: 'remove_tag',
        label: 'Remove Tag',
        icon: '🏷️',
        description: 'Remove a tag from contacts',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'vip' },
          { name: 'identifier', label: 'Contact Name/Email (optional for all)', type: 'text', required: false, placeholder: 'john@example.com or leave blank for all' }
        ],
        buildCommand: (data) => data.identifier ? `remove tag ${data.tag} from contact ${data.identifier}` : `remove tag ${data.tag} from contacts`
      },
      {
        id: 'contacts_missing_field',
        label: 'Find Missing Fields',
        icon: '🔍',
        description: 'Find contacts missing specific data',
        fields: [
          { name: 'field', label: 'Missing Field', type: 'select', required: true, options: ['email', 'phone', 'name', 'address', 'tags'] }
        ],
        buildCommand: (data) => `find contacts missing ${data.field}`
      },
      {
        id: 'search_contacts',
        label: 'Search Contacts',
        icon: '🔍',
        description: 'Search contacts by field value',
        fields: [
          { name: 'field', label: 'Search Field', type: 'select', required: true, options: ['name', 'email', 'phone', 'tag', 'city', 'state'] },
          { name: 'value', label: 'Search Value', type: 'text', required: true, placeholder: 'John' }
        ],
        buildCommand: (data) => `search contacts by ${data.field} equal to ${data.value}`
      },
      {
        id: 'import_contacts',
        label: 'Import Contacts',
        icon: '📥',
        description: 'Import contacts from a source',
        fields: [
          { name: 'source', label: 'Source Name', type: 'text', required: true, placeholder: 'CSV file, Google Contacts, etc.' }
        ],
        buildCommand: (data) => `import contacts from ${data.source}`
      },
      {
        id: 'export_contacts',
        label: 'Export Contacts',
        icon: '📤',
        description: 'Export contacts to a file',
        fields: [
          { name: 'format', label: 'File Format', type: 'select', required: true, options: ['CSV', 'Excel', 'JSON', 'PDF'] }
        ],
        buildCommand: (data) => `export contacts as ${data.format}`
      },
      {
        id: 'restore_contact',
        label: 'Restore Contact',
        icon: '♻️',
        description: 'Restore a soft-deleted contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `restore contact ${data.identifier}`
      },
      {
        id: 'list_contacts',
        label: 'List All Contacts',
        icon: '📋',
        description: 'Show all contacts in your CRM',
        fields: [],
        buildCommand: () => `list contacts`
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
          { name: 'identifier', label: 'Contact Name/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Your appointment is confirmed for tomorrow at 2pm' }
        ],
        buildCommand: (data) => `send text message to ${data.identifier} saying ${data.message}`
      },
      {
        id: 'send_email',
        label: 'Send Email',
        icon: '📧',
        description: 'Send an email to a contact or group',
        fields: [
          { name: 'recipient', label: 'Recipient (contact or group)', type: 'text', required: true, placeholder: 'john@example.com or "all vip"' },
          { name: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Welcome to our service' },
          { name: 'body', label: 'Message Body', type: 'textarea', required: true, placeholder: 'Thank you for joining...' }
        ],
        buildCommand: (data) => `send email to ${data.recipient} with subject ${data.subject} and body ${data.body}`
      },
      {
        id: 'reply_message',
        label: 'Reply to Last Message',
        icon: '↩️',
        description: 'Reply to the most recent message',
        fields: [
          { name: 'message', label: 'Reply Message', type: 'textarea', required: true, placeholder: 'Thanks for reaching out...' }
        ],
        buildCommand: (data) => `reply to last message saying ${data.message}`
      },
      {
        id: 'show_messages',
        label: 'Show Messages',
        icon: '📬',
        description: 'Show messages by status',
        fields: [
          { name: 'status', label: 'Message Status', type: 'select', required: true, options: ['unread', 'sent', 'failed', 'all'] }
        ],
        buildCommand: (data) => `show all ${data.status} messages`
      },
      {
        id: 'message_history',
        label: 'Message History',
        icon: '📜',
        description: 'Show message history for a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `show message history for ${data.identifier}`
      },
      {
        id: 'forward_calls',
        label: 'Forward Calls',
        icon: '📞',
        description: 'Forward incoming calls to a number',
        fields: [
          { name: 'number', label: 'Destination Number', type: 'tel', required: true, placeholder: '5551234567' }
        ],
        buildCommand: (data) => `forward incoming calls to ${data.number}`
      },
      {
        id: 'transfer_call',
        label: 'Transfer Call',
        icon: '📞',
        description: 'Transfer the active call',
        fields: [
          { name: 'destination', label: 'User or Team Name', type: 'text', required: true, placeholder: 'Sales Team' }
        ],
        buildCommand: (data) => `transfer active call to ${data.destination}`
      },
      {
        id: 'start_live_chat',
        label: 'Start Live Chat',
        icon: '💬',
        description: 'Start a live chat with a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `start live chat with ${data.identifier}`
      },
      {
        id: 'broadcast_message',
        label: 'Broadcast Message',
        icon: '📢',
        description: 'Send broadcast to tagged contacts',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'vip' },
          { name: 'message', label: 'Broadcast Message', type: 'textarea', required: true, placeholder: 'Special offer for VIP customers...' }
        ],
        buildCommand: (data) => `send broadcast message to all contacts tagged ${data.tag}: ${data.message}`
      },
      {
        id: 'schedule_message',
        label: 'Schedule Message',
        icon: '⏰',
        description: 'Schedule a message for future delivery',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'time', label: 'Send Time', type: 'text', required: true, placeholder: 'tomorrow at 9am' },
          { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Don\'t forget about your appointment...' }
        ],
        buildCommand: (data) => `schedule message to ${data.identifier} at ${data.time}: ${data.message}`
      },
      {
        id: 'cancel_scheduled_message',
        label: 'Cancel Scheduled Message',
        icon: '❌',
        description: 'Cancel a scheduled message',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `cancel scheduled message to ${data.identifier}`
      }
    ]
  },

  // ===== APPOINTMENTS, CALENDARS & SCHEDULING =====
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
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'datetime', label: 'Date & Time', type: 'text', required: true, placeholder: 'tomorrow at 2pm or 2025-12-25 14:00' }
        ],
        buildCommand: (data) => `book appointment with ${data.identifier} on ${data.datetime}`
      },
      {
        id: 'reschedule_appointment',
        label: 'Reschedule Appointment',
        icon: '🔄',
        description: 'Reschedule an existing appointment',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'datetime', label: 'New Date & Time', type: 'text', required: true, placeholder: 'next Monday at 3pm' }
        ],
        buildCommand: (data) => `reschedule appointment with ${data.identifier} to ${data.datetime}`
      },
      {
        id: 'cancel_appointment',
        label: 'Cancel Appointment',
        icon: '❌',
        description: 'Cancel an appointment',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `cancel appointment with ${data.identifier}`,
        confirmMessage: 'Are you sure you want to cancel this appointment?'
      },
      {
        id: 'show_appointments',
        label: 'Show Appointments',
        icon: '📋',
        description: 'List appointments for a time period',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'tomorrow', 'this week', 'next week', 'this month', 'all'] }
        ],
        buildCommand: (data) => `show all appointments for ${data.period}`
      },
      {
        id: 'appointment_details',
        label: 'Appointment Details',
        icon: '🔍',
        description: 'Show appointment details for a contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `show appointment details for ${data.identifier}`
      },
      {
        id: 'missed_appointments',
        label: 'Missed Appointments',
        icon: '⚠️',
        description: 'List missed or no-show appointments',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'yesterday', 'this week', 'this month'] }
        ],
        buildCommand: (data) => `list missed or no-show appointments for ${data.period}`
      },
      {
        id: 'add_reminder',
        label: 'Add Reminder',
        icon: '⏰',
        description: 'Set a reminder to follow up',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'time', label: 'Reminder Time', type: 'text', required: true, placeholder: 'tomorrow at 10am' }
        ],
        buildCommand: (data) => `add reminder to follow up with ${data.identifier} at ${data.time}`
      },
      {
        id: 'set_appointment_status',
        label: 'Set Appointment Status',
        icon: '✅',
        description: 'Update appointment status',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'status', label: 'Status', type: 'select', required: true, options: ['confirmed', 'canceled', 'rescheduled', 'completed', 'no-show'] }
        ],
        buildCommand: (data) => `set appointment status of ${data.identifier} to ${data.status}`
      },
      {
        id: 'assign_appointment',
        label: 'Assign Appointment',
        icon: '👤',
        description: 'Assign appointment to team member',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'team_member', label: 'Team Member Name', type: 'text', required: true, placeholder: 'Sarah Johnson' }
        ],
        buildCommand: (data) => `assign appointment to team member ${data.team_member}`
      },
      {
        id: 'calendar_availability',
        label: 'Check Availability',
        icon: '📅',
        description: 'Show calendar availability',
        fields: [
          { name: 'team_member', label: 'Team Member Name', type: 'text', required: true, placeholder: 'Sarah Johnson' },
          { name: 'date', label: 'Date', type: 'text', required: true, placeholder: 'tomorrow or 2025-12-25' }
        ],
        buildCommand: (data) => `show calendar availability for ${data.team_member} on ${data.date}`
      },
      {
        id: 'block_time_slot',
        label: 'Block Time Slot',
        icon: '🚫',
        description: 'Block a time slot on calendar',
        fields: [
          { name: 'time_slot', label: 'Time Slot', type: 'text', required: true, placeholder: 'tomorrow 2pm-4pm' }
        ],
        buildCommand: (data) => `block time slot ${data.time_slot}`
      },
      {
        id: 'booking_link',
        label: 'Get Booking Link',
        icon: '🔗',
        description: 'Get booking link for a service',
        fields: [
          { name: 'service', label: 'Service Name', type: 'text', required: true, placeholder: 'Consultation' }
        ],
        buildCommand: (data) => `open booking link for service ${data.service}`
      },
      {
        id: 'show_calendars',
        label: 'Show Calendars',
        icon: '📅',
        description: 'List all available calendars',
        fields: [],
        buildCommand: () => `show calendars`
      }
    ]
  },

  // ===== PIPELINES, DEALS & OPPORTUNITIES =====
  pipelines: {
    category: 'Pipelines & Deals',
    icon: '💰',
    commands: [
      {
        id: 'create_deal',
        label: 'Create Deal',
        icon: '➕',
        description: 'Create a new deal/opportunity',
        fields: [
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale - Acme Corp' },
          { name: 'amount', label: 'Deal Amount', type: 'text', required: true, placeholder: '5000' },
          { name: 'pipeline', label: 'Pipeline Name', type: 'text', required: true, placeholder: 'Sales Pipeline' }
        ],
        buildCommand: (data) => `create new deal named ${data.deal_name} for ${data.amount} in pipeline ${data.pipeline}`
      },
      {
        id: 'move_deal',
        label: 'Move Deal',
        icon: '➡️',
        description: 'Move deal to different stage',
        fields: [
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' },
          { name: 'stage', label: 'Stage Name', type: 'text', required: true, placeholder: 'Proposal Sent' }
        ],
        buildCommand: (data) => `move deal ${data.deal_name} to stage ${data.stage}`
      },
      {
        id: 'update_deal_amount',
        label: 'Update Deal Amount',
        icon: '💵',
        description: 'Update the amount of a deal',
        fields: [
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' },
          { name: 'amount', label: 'New Amount', type: 'text', required: true, placeholder: '7500' }
        ],
        buildCommand: (data) => `update deal ${data.deal_name} amount to ${data.amount}`
      },
      {
        id: 'delete_deal',
        label: 'Delete Deal',
        icon: '🗑️',
        description: 'Delete a deal',
        fields: [
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' }
        ],
        buildCommand: (data) => `delete deal ${data.deal_name}`,
        confirmMessage: 'Are you sure you want to delete this deal?'
      },
      {
        id: 'deals_by_stage',
        label: 'Deals by Stage',
        icon: '📊',
        description: 'Show deals in a specific stage',
        fields: [
          { name: 'stage', label: 'Stage Name', type: 'text', required: true, placeholder: 'Proposal Sent' }
        ],
        buildCommand: (data) => `show all deals in stage ${data.stage}`
      },
      {
        id: 'show_open_deals',
        label: 'Show Open Deals',
        icon: '📂',
        description: 'List all open deals',
        fields: [],
        buildCommand: () => `show all open deals`
      },
      {
        id: 'show_won_deals',
        label: 'Show Won Deals',
        icon: '🏆',
        description: 'Show closed/won deals',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `show closed won deals this ${data.period}`
      },
      {
        id: 'show_lost_deals',
        label: 'Show Lost Deals',
        icon: '📉',
        description: 'List lost deals',
        fields: [],
        buildCommand: () => `show lost deals`
      },
      {
        id: 'pipeline_summary',
        label: 'Pipeline Summary',
        icon: '📊',
        description: 'Show summary for a pipeline',
        fields: [
          { name: 'pipeline', label: 'Pipeline Name', type: 'text', required: true, placeholder: 'Sales Pipeline' }
        ],
        buildCommand: (data) => `show pipeline summary for ${data.pipeline}`
      },
      {
        id: 'assign_deal',
        label: 'Assign Deal',
        icon: '👤',
        description: 'Assign deal to a user',
        fields: [
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' },
          { name: 'user', label: 'User Name', type: 'text', required: true, placeholder: 'Sarah Johnson' }
        ],
        buildCommand: (data) => `assign deal ${data.deal_name} to ${data.user}`
      },
      {
        id: 'add_deal_note',
        label: 'Add Deal Note',
        icon: '📝',
        description: 'Add a note to a deal',
        fields: [
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' },
          { name: 'note', label: 'Note Content', type: 'textarea', required: true, placeholder: 'Client requested custom pricing...' }
        ],
        buildCommand: (data) => `add note to deal ${data.deal_name} saying ${data.note}`
      },
      {
        id: 'add_deal_tag',
        label: 'Tag Deal',
        icon: '🏷️',
        description: 'Add a tag to a deal',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'high-value' },
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' }
        ],
        buildCommand: (data) => `add tag ${data.tag} to deal ${data.deal_name}`
      },
      {
        id: 'remove_deal_tag',
        label: 'Remove Deal Tag',
        icon: '🏷️',
        description: 'Remove a tag from a deal',
        fields: [
          { name: 'tag', label: 'Tag Name', type: 'text', required: true, placeholder: 'high-value' },
          { name: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: 'Enterprise Sale' }
        ],
        buildCommand: (data) => `remove tag ${data.tag} from deal ${data.deal_name}`
      },
      {
        id: 'show_opportunities',
        label: 'Show All Opportunities',
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

  // ===== AUTOMATIONS, WORKFLOWS, CAMPAIGNS =====
  workflows: {
    category: 'Workflows & Campaigns',
    icon: '🔄',
    commands: [
      {
        id: 'create_workflow',
        label: 'Create Workflow',
        icon: '➕',
        description: 'Create a new workflow',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'New Lead Nurture' }
        ],
        buildCommand: (data) => `create new workflow named ${data.workflow_name}`
      },
      {
        id: 'delete_workflow',
        label: 'Delete Workflow',
        icon: '🗑️',
        description: 'Delete a workflow',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Old Campaign' }
        ],
        buildCommand: (data) => `delete workflow ${data.workflow_name}`,
        confirmMessage: 'Are you sure you want to delete this workflow?'
      },
      {
        id: 'activate_workflow',
        label: 'Activate Workflow',
        icon: '▶️',
        description: 'Activate a workflow',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Lead Nurture' }
        ],
        buildCommand: (data) => `activate workflow ${data.workflow_name}`
      },
      {
        id: 'pause_workflow',
        label: 'Pause Workflow',
        icon: '⏸️',
        description: 'Pause a workflow',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Lead Nurture' }
        ],
        buildCommand: (data) => `pause workflow ${data.workflow_name}`
      },
      {
        id: 'show_running_workflows',
        label: 'Show Running Workflows',
        icon: '▶️',
        description: 'List all active workflows',
        fields: [],
        buildCommand: () => `show all running workflows`
      },
      {
        id: 'workflow_details',
        label: 'Workflow Details',
        icon: '🔍',
        description: 'Show workflow details',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Lead Nurture' }
        ],
        buildCommand: (data) => `show workflow details for ${data.workflow_name}`
      },
      {
        id: 'test_workflow',
        label: 'Test Workflow',
        icon: '🧪',
        description: 'Test a workflow',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Lead Nurture' }
        ],
        buildCommand: (data) => `test workflow ${data.workflow_name}`
      },
      {
        id: 'clone_workflow',
        label: 'Clone Workflow',
        icon: '📋',
        description: 'Duplicate a workflow',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Lead Nurture' }
        ],
        buildCommand: (data) => `clone workflow ${data.workflow_name}`
      },
      {
        id: 'export_workflow',
        label: 'Export Workflow',
        icon: '📤',
        description: 'Export workflow as JSON',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Lead Nurture' }
        ],
        buildCommand: (data) => `export workflow ${data.workflow_name} as JSON`
      },
      {
        id: 'import_workflow',
        label: 'Import Workflow',
        icon: '📥',
        description: 'Import workflow from JSON',
        fields: [
          { name: 'workflow_name', label: 'Workflow Name', type: 'text', required: true, placeholder: 'Imported Campaign' }
        ],
        buildCommand: (data) => `import workflow from JSON into ${data.workflow_name}`
      },
      {
        id: 'start_campaign',
        label: 'Start Campaign',
        icon: '▶️',
        description: 'Start a campaign',
        fields: [
          { name: 'campaign_name', label: 'Campaign Name', type: 'text', required: true, placeholder: 'Summer Sale 2025' }
        ],
        buildCommand: (data) => `start campaign ${data.campaign_name}`
      },
      {
        id: 'pause_campaign',
        label: 'Pause Campaign',
        icon: '⏸️',
        description: 'Pause a campaign',
        fields: [
          { name: 'campaign_name', label: 'Campaign Name', type: 'text', required: true, placeholder: 'Summer Sale 2025' }
        ],
        buildCommand: (data) => `pause campaign ${data.campaign_name}`
      },
      {
        id: 'stop_campaign',
        label: 'Stop Campaign',
        icon: '⏹️',
        description: 'Stop a campaign',
        fields: [
          { name: 'campaign_name', label: 'Campaign Name', type: 'text', required: true, placeholder: 'Old Campaign' }
        ],
        buildCommand: (data) => `stop campaign ${data.campaign_name}`,
        confirmMessage: 'Are you sure you want to stop this campaign?'
      },
      {
        id: 'campaign_stats',
        label: 'Campaign Stats',
        icon: '📊',
        description: 'Show campaign statistics',
        fields: [
          { name: 'campaign_name', label: 'Campaign Name (or time period)', type: 'text', required: true, placeholder: 'Summer Sale or "this month"' }
        ],
        buildCommand: (data) => `show campaign stats for ${data.campaign_name}`
      },
      {
        id: 'add_to_workflow',
        label: 'Add to Workflow',
        icon: '🔄',
        description: 'Enroll contact in a workflow',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'workflow_id', label: 'Workflow ID or Name', type: 'text', required: true, placeholder: 'abc123 or Lead Nurture' }
        ],
        buildCommand: (data) => `add ${data.identifier} to workflow ${data.workflow_id}`
      },
      {
        id: 'add_to_campaign',
        label: 'Add to Campaign',
        icon: '📢',
        description: 'Add contact to a campaign',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'campaign_id', label: 'Campaign ID or Name', type: 'text', required: true, placeholder: 'welcome' }
        ],
        buildCommand: (data) => `add ${data.identifier} to campaign ${data.campaign_id}`
      }
    ]
  },

  // ===== FORMS, SURVEYS & FUNNELS =====
  forms: {
    category: 'Forms & Funnels',
    icon: '📋',
    commands: [
      {
        id: 'create_form',
        label: 'Create Form',
        icon: '➕',
        description: 'Create a new form',
        fields: [
          { name: 'form_name', label: 'Form Name', type: 'text', required: true, placeholder: 'Contact Us Form' }
        ],
        buildCommand: (data) => `create new form ${data.form_name}`
      },
      {
        id: 'delete_form',
        label: 'Delete Form',
        icon: '🗑️',
        description: 'Delete a form',
        fields: [
          { name: 'form_name', label: 'Form Name', type: 'text', required: true, placeholder: 'Old Form' }
        ],
        buildCommand: (data) => `delete form ${data.form_name}`,
        confirmMessage: 'Are you sure you want to delete this form?'
      },
      {
        id: 'show_all_forms',
        label: 'Show All Forms',
        icon: '📋',
        description: 'List all forms',
        fields: [],
        buildCommand: () => `show all forms`
      },
      {
        id: 'form_submissions',
        label: 'Form Submissions',
        icon: '📊',
        description: 'Get form submissions',
        fields: [
          { name: 'form_name', label: 'Form Name', type: 'text', required: true, placeholder: 'Contact Us' }
        ],
        buildCommand: (data) => `get form submissions for ${data.form_name}`
      },
      {
        id: 'send_form',
        label: 'Send Form',
        icon: '📤',
        description: 'Send form to contact or group',
        fields: [
          { name: 'form_name', label: 'Form Name', type: 'text', required: true, placeholder: 'Survey Form' },
          { name: 'recipient', label: 'Contact or Group', type: 'text', required: true, placeholder: 'john@example.com or "vip"' }
        ],
        buildCommand: (data) => `send form ${data.form_name} to ${data.recipient}`
      },
      {
        id: 'create_funnel',
        label: 'Create Funnel',
        icon: '🌊',
        description: 'Create a new funnel',
        fields: [
          { name: 'funnel_name', label: 'Funnel Name', type: 'text', required: true, placeholder: 'Product Launch Funnel' }
        ],
        buildCommand: (data) => `create new funnel ${data.funnel_name}`
      },
      {
        id: 'delete_funnel',
        label: 'Delete Funnel',
        icon: '🗑️',
        description: 'Delete a funnel',
        fields: [
          { name: 'funnel_name', label: 'Funnel Name', type: 'text', required: true, placeholder: 'Old Funnel' }
        ],
        buildCommand: (data) => `delete funnel ${data.funnel_name}`,
        confirmMessage: 'Are you sure you want to delete this funnel?'
      },
      {
        id: 'funnel_performance',
        label: 'Funnel Performance',
        icon: '📊',
        description: 'Show funnel performance stats',
        fields: [
          { name: 'funnel_name', label: 'Funnel Name', type: 'text', required: true, placeholder: 'Product Launch' }
        ],
        buildCommand: (data) => `show funnel performance for ${data.funnel_name}`
      },
      {
        id: 'clone_funnel',
        label: 'Clone Funnel',
        icon: '📋',
        description: 'Duplicate a funnel',
        fields: [
          { name: 'funnel_name', label: 'Funnel Name', type: 'text', required: true, placeholder: 'Product Launch' }
        ],
        buildCommand: (data) => `clone funnel ${data.funnel_name}`
      }
    ]
  },

  // ===== MEMBERSHIPS, COURSES & PRODUCTS =====
  products: {
    category: 'Products & Courses',
    icon: '🛍️',
    commands: [
      {
        id: 'create_product',
        label: 'Create Product',
        icon: '➕',
        description: 'Create a new product or course',
        fields: [
          { name: 'product_name', label: 'Product/Course Name', type: 'text', required: true, placeholder: 'Premium Membership' }
        ],
        buildCommand: (data) => `create new product ${data.product_name}`
      },
      {
        id: 'update_product',
        label: 'Update Product',
        icon: '✏️',
        description: 'Update product information',
        fields: [
          { name: 'product_name', label: 'Product Name', type: 'text', required: true, placeholder: 'Premium Membership' },
          { name: 'field', label: 'Field to Update', type: 'select', required: true, options: ['price', 'name', 'description', 'status'] },
          { name: 'value', label: 'New Value', type: 'text', required: true, placeholder: 'New value' }
        ],
        buildCommand: (data) => `update ${data.field} for product ${data.product_name} to ${data.value}`
      },
      {
        id: 'delete_product',
        label: 'Delete Product',
        icon: '🗑️',
        description: 'Delete a product',
        fields: [
          { name: 'product_name', label: 'Product Name', type: 'text', required: true, placeholder: 'Old Product' }
        ],
        buildCommand: (data) => `delete product ${data.product_name}`,
        confirmMessage: 'Are you sure you want to delete this product?'
      },
      {
        id: 'show_all_products',
        label: 'Show All Products',
        icon: '📋',
        description: 'List all products',
        fields: [],
        buildCommand: () => `show all products`
      },
      {
        id: 'enroll_contact',
        label: 'Enroll Contact',
        icon: '➕',
        description: 'Enroll contact in product/course',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'product_name', label: 'Product/Course Name', type: 'text', required: true, placeholder: 'Premium Membership' }
        ],
        buildCommand: (data) => `enroll ${data.identifier} into product ${data.product_name}`
      },
      {
        id: 'unenroll_contact',
        label: 'Unenroll Contact',
        icon: '➖',
        description: 'Unenroll contact from product/course',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' },
          { name: 'product_name', label: 'Product/Course Name', type: 'text', required: true, placeholder: 'Premium Membership' }
        ],
        buildCommand: (data) => `unenroll ${data.identifier} from product ${data.product_name}`
      },
      {
        id: 'purchase_history',
        label: 'Purchase History',
        icon: '📜',
        description: 'Get purchase history for contact',
        fields: [
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `get purchase history for ${data.identifier}`
      },
      {
        id: 'issue_refund',
        label: 'Issue Refund',
        icon: '💸',
        description: 'Issue refund for a purchase',
        fields: [
          { name: 'product_name', label: 'Product Name', type: 'text', required: true, placeholder: 'Premium Membership' },
          { name: 'identifier', label: 'Contact Name/Email', type: 'text', required: true, placeholder: 'john@example.com' }
        ],
        buildCommand: (data) => `issue refund for ${data.product_name} purchase by ${data.identifier}`,
        confirmMessage: 'Are you sure you want to issue this refund?'
      }
    ]
  },

  // ===== TEAMS, USERS & PERMISSIONS =====
  teams: {
    category: 'Teams & Users',
    icon: '👥',
    commands: [
      {
        id: 'create_user',
        label: 'Create User',
        icon: '➕',
        description: 'Create a new user',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'Sarah Johnson' },
          { name: 'role', label: 'Role', type: 'select', required: true, options: ['admin', 'user', 'agent', 'manager', 'viewer'] }
        ],
        buildCommand: (data) => `create user ${data.user_name} with role ${data.role}`
      },
      {
        id: 'update_user_role',
        label: 'Update User Role',
        icon: '✏️',
        description: 'Update user role or permissions',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'Sarah Johnson' },
          { name: 'role', label: 'New Role', type: 'select', required: true, options: ['admin', 'user', 'agent', 'manager', 'viewer'] }
        ],
        buildCommand: (data) => `update role or permissions for user ${data.user_name} to ${data.role}`
      },
      {
        id: 'delete_user',
        label: 'Delete User',
        icon: '🗑️',
        description: 'Delete a user',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'Old User' }
        ],
        buildCommand: (data) => `delete user ${data.user_name}`,
        confirmMessage: 'Are you sure you want to delete this user?'
      },
      {
        id: 'suspend_user',
        label: 'Suspend User',
        icon: '⏸️',
        description: 'Suspend a user account',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'User Name' }
        ],
        buildCommand: (data) => `suspend user ${data.user_name}`
      },
      {
        id: 'activate_user',
        label: 'Activate User',
        icon: '▶️',
        description: 'Activate a user account',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'User Name' }
        ],
        buildCommand: (data) => `activate user ${data.user_name}`
      },
      {
        id: 'show_team_members',
        label: 'Show Team Members',
        icon: '👥',
        description: 'List all team members',
        fields: [],
        buildCommand: () => `show all team members`
      },
      {
        id: 'assign_user_to_team',
        label: 'Assign to Team',
        icon: '➕',
        description: 'Assign user to a team',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'Sarah Johnson' },
          { name: 'team_name', label: 'Team Name', type: 'text', required: true, placeholder: 'Sales Team' }
        ],
        buildCommand: (data) => `assign user ${data.user_name} to team ${data.team_name}`
      },
      {
        id: 'remove_user_from_team',
        label: 'Remove from Team',
        icon: '➖',
        description: 'Remove user from a team',
        fields: [
          { name: 'user_name', label: 'User Name', type: 'text', required: true, placeholder: 'Sarah Johnson' },
          { name: 'team_name', label: 'Team Name', type: 'text', required: true, placeholder: 'Sales Team' }
        ],
        buildCommand: (data) => `remove user ${data.user_name} from team ${data.team_name}`
      }
    ]
  },

  // ===== SETTINGS, CONFIGURATION & SYSTEM =====
  system: {
    category: 'System & Settings',
    icon: '⚙️',
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
      },
      {
        id: 'get_api_key',
        label: 'Get API Key',
        icon: '🔑',
        description: 'Show current API key',
        fields: [],
        buildCommand: () => `get or show current API key`
      },
      {
        id: 'regenerate_api_key',
        label: 'Regenerate API Key',
        icon: '🔄',
        description: 'Generate new API key',
        fields: [],
        buildCommand: () => `regenerate API key`,
        confirmMessage: 'This will invalidate your current API key. Continue?'
      },
      {
        id: 'show_integration_settings',
        label: 'Integration Settings',
        icon: '🔌',
        description: 'Show integration settings',
        fields: [],
        buildCommand: () => `show integration settings`
      },
      {
        id: 'connect_external_service',
        label: 'Connect Service',
        icon: '🔗',
        description: 'Connect an external service',
        fields: [
          { name: 'service_name', label: 'Service Name', type: 'text', required: true, placeholder: 'Zapier, Stripe, etc.' }
        ],
        buildCommand: (data) => `connect external service ${data.service_name}`
      },
      {
        id: 'disconnect_external_service',
        label: 'Disconnect Service',
        icon: '🔌',
        description: 'Disconnect an external service',
        fields: [
          { name: 'service_name', label: 'Service Name', type: 'text', required: true, placeholder: 'Zapier, Stripe, etc.' }
        ],
        buildCommand: (data) => `disconnect external service ${data.service_name}`,
        confirmMessage: 'Are you sure you want to disconnect this service?'
      },
      {
        id: 'sync_data',
        label: 'Sync Data',
        icon: '🔄',
        description: 'Sync data with external platform',
        fields: [
          { name: 'platform_name', label: 'Platform Name', type: 'text', required: true, placeholder: 'Stripe, Mailchimp, etc.' }
        ],
        buildCommand: (data) => `sync data with ${data.platform_name}`
      },
      {
        id: 'export_data',
        label: 'Export Data',
        icon: '📤',
        description: 'Export system data',
        fields: [
          { name: 'format', label: 'File Format', type: 'select', required: true, options: ['CSV', 'Excel', 'JSON', 'PDF'] }
        ],
        buildCommand: (data) => `export data as ${data.format}`
      },
      {
        id: 'import_data',
        label: 'Import Data',
        icon: '📥',
        description: 'Import data from source',
        fields: [
          { name: 'source', label: 'Source Name', type: 'text', required: true, placeholder: 'CSV file, API, etc.' }
        ],
        buildCommand: (data) => `import data from ${data.source}`
      },
      {
        id: 'rename_pipeline',
        label: 'Rename Pipeline',
        icon: '✏️',
        description: 'Rename a pipeline',
        fields: [
          { name: 'old_name', label: 'Current Name', type: 'text', required: true, placeholder: 'Sales Pipeline' },
          { name: 'new_name', label: 'New Name', type: 'text', required: true, placeholder: 'Enterprise Sales' }
        ],
        buildCommand: (data) => `rename pipeline ${data.old_name} to ${data.new_name}`
      },
      {
        id: 'show_account_info',
        label: 'Account Info',
        icon: '📊',
        description: 'Show account usage and plan',
        fields: [],
        buildCommand: () => `show account usage, subscription or plan information`
      }
    ]
  },

  // ===== REPORTS, METRICS & ANALYTICS =====
  reports: {
    category: 'Reports & Analytics',
    icon: '📊',
    commands: [
      {
        id: 'total_leads',
        label: 'Total Leads',
        icon: '📈',
        description: 'Show total leads created',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `show total leads created in ${data.period}`
      },
      {
        id: 'total_calls',
        label: 'Total Calls',
        icon: '📞',
        description: 'Show total calls made',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['today', 'this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `show total calls made in ${data.period}`
      },
      {
        id: 'conversion_rate',
        label: 'Conversion Rate',
        icon: '📊',
        description: 'Show conversion rate by source',
        fields: [
          { name: 'source', label: 'Source Name', type: 'text', required: true, placeholder: 'Google Ads, Facebook, etc.' },
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `show conversion rate by ${data.source} over ${data.period}`
      },
      {
        id: 'top_campaigns',
        label: 'Top Campaigns',
        icon: '🏆',
        description: 'List top performing campaigns',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `list top performing campaigns in ${data.period}`
      },
      {
        id: 'revenue_by_stage',
        label: 'Revenue by Stage',
        icon: '💰',
        description: 'Show revenue by pipeline stage',
        fields: [
          { name: 'pipeline', label: 'Pipeline Name', type: 'text', required: true, placeholder: 'Sales Pipeline' }
        ],
        buildCommand: (data) => `show revenue by pipeline stage in ${data.pipeline}`
      },
      {
        id: 'performance_report',
        label: 'Performance Report',
        icon: '📊',
        description: 'Generate performance report',
        fields: [
          { name: 'metric', label: 'Metric Type', type: 'select', required: true, options: ['sales', 'leads', 'conversions', 'revenue', 'activity'] },
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `generate performance report for ${data.metric} over ${data.period}`
      },
      {
        id: 'show_trends',
        label: 'Show Trends',
        icon: '📈',
        description: 'Show chart/trends for metric',
        fields: [
          { name: 'metric', label: 'Metric Type', type: 'select', required: true, options: ['sales', 'leads', 'conversions', 'revenue', 'contacts'] },
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `show chart trends for ${data.metric} over ${data.period}`
      },
      {
        id: 'export_report',
        label: 'Export Report',
        icon: '📤',
        description: 'Export a report',
        fields: [
          { name: 'report_name', label: 'Report Name', type: 'text', required: true, placeholder: 'Sales Report' },
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `export report ${data.report_name} for ${data.period}`
      },
      {
        id: 'compare_metrics',
        label: 'Compare Metrics',
        icon: '⚖️',
        description: 'Compare metrics between periods',
        fields: [
          { name: 'period1', label: 'Period 1', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] },
          { name: 'period2', label: 'Period 2', type: 'select', required: true, options: ['last week', 'last month', 'last quarter', 'last year'] }
        ],
        buildCommand: (data) => `compare metrics between ${data.period1} and ${data.period2}`
      },
      {
        id: 'contact_growth',
        label: 'Contact Growth',
        icon: '📈',
        description: 'Show contact growth by tag',
        fields: [
          { name: 'period', label: 'Time Period', type: 'select', required: true, options: ['this week', 'this month', 'this quarter', 'this year'] }
        ],
        buildCommand: (data) => `show contact growth by tag over ${data.period}`
      },
      {
        id: 'deal_velocity',
        label: 'Deal Velocity',
        icon: '⚡',
        description: 'Show deal velocity per stage',
        fields: [],
        buildCommand: () => `show deal velocity per stage`
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
          { name: 'identifier', label: 'Contact Name/Email/Phone', type: 'text', required: true, placeholder: 'john@example.com' }
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
          { name: 'time', label: 'When to Post', type: 'text', required: true, placeholder: 'tomorrow at 10am' },
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
