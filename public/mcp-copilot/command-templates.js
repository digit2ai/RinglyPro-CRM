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
        buildCommand: () => `💡 **How to Use Contact Commands**

Just TYPE what you want to do in the chat box below - no forms needed!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**✅ Available Commands:**

**✅ Create Contact** - Fully working!
   Type: "create contact"
   → I'll ask for: name, phone, email
   → You confirm, I create it!

**✅ Search Contacts** - No more duplicates!
   Type: "find John" or "search contacts john@example.com"
   → I'll show matching contacts

**✅ Update Contact** - Ready to use!
   Type: "update contact"
   → I'll ask: which contact? what field? new value?
   → You confirm, I update it!

**✅ Send SMS** - Ready to use!
   Type: "send sms"
   → I'll ask: which contact? what message?
   → You confirm, I send it!

**✅ Send Email** - Ready to use!
   Type: "send email"
   → I'll ask: which contact? subject? message?
   → You confirm, I send it!

**✅ Add/Remove Tags** - Ready to use!
   Type: "add tag" or "remove tag"
   → I'll ask: which contact? which tag?
   → You confirm, I do it!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**💡 Quick Tips:**
• Just type naturally - I'll guide you!
• I'll ask questions to get what I need
• Type "cancel" anytime to stop
• I always confirm before making changes

**👉 Try it now:** Type "create contact" below! ⬇️`
      }
    ]
  }
};
