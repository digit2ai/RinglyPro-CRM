// Command Templates with Dynamic Form Fields
// Simplified - Only Contacts Help Button (all operations use Conversational Agent)

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
        isHelpOnly: true, // Flag to indicate this is informational only
        buildCommand: () => `💡 **How to Use the Conversational Agent**

Instead of filling forms, just TYPE what you want to do in the chat box below!

**Examples:**
• Type: "create contact" → I'll ask for details
• Type: "update contact" → I'll ask which one
• Type: "add tag" → I'll guide you
• Type: "send sms" → I'll help you
• Type: "search contacts John" → I'll find them

**Tips:**
✓ Just type naturally - no forms needed!
✓ I'll ask questions to get what I need
✓ Type "cancel" anytime to stop
✓ I'll confirm before making changes

**Try it now:** Type "create contact" in the chat box below! ⬇️`
      }
    ]
  }
};
