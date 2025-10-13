# Complete Test Guide: All 21 GoHighLevel MCP Tools

This guide provides natural language test examples for all 21 official GoHighLevel MCP tools accessible through the MCP Copilot interface at `/mcp-copilot/`.

## Setup
1. Navigate to: `https://ringlypro-crm.onrender.com/mcp-copilot/`
2. Select "GoHighLevel" from CRM dropdown
3. Enter credentials:
   - **API Key**: `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
   - **Location ID**: `3lSeAHXNU9t09Hhp9oai`
4. Click "Connect to GoHighLevel"
5. Wait for "✅ Successfully connected to GoHighLevel!"

---

## 📇 CONTACTS (8 Tools)

### 1. contacts_get-contacts (Search Contacts)

**Natural Language Examples:**
```
search contacts
find contact Manuel
search for francisco
find contact with email bob@company.com
search contacts limit 5
```

**What to Expect:**
- List of matching contacts with names, emails, and phones
- Shows up to 20 contacts by default
- Displays contact ID, name, email, and phone

**Test Commands:**
1. `search contact Manuel` - Should find Manuel Stagg if exists
2. `find all contacts` - Returns up to 20 contacts
3. `search francisco` - Should find francisco serna
4. `find contact bob` - Search by partial name

---

### 2. contacts_create-contact (Create Contact)

**Natural Language Examples:**
```
Add contact named John Smith
Create contact Bob Johnson with email bob@company.com
Add contact Sarah Lee with phone 813-555-1234
Create contact Mike Davis with email mike@test.com and phone 555-0123
Add contact named Jane Williams with email jane@example.com and phone 813-555-9999
```

**What to Expect:**
- Confirmation message with new contact ID
- Contact immediately searchable
- Returns full contact object

**Test Commands:**
1. `Add contact named Alice Cooper` - Basic name only
2. `Create contact David Brown with email david@test.com` - Name + email
3. `Add contact named Emily White with phone 813-555-4567` - Name + phone
4. `Create contact Tom Green with email tom@company.com and phone 555-8888` - All fields

**Parameter Requirements:**
- **firstName** (required)
- **lastName** (required)
- **email** (optional)
- **phone** (optional)
- **locationId** (auto-added)

---

### 3. contacts_get-contact (Get Single Contact)

**Natural Language Examples:**
```
Get contact OCJbPIJvBK4nK2yWoMw9
Show me contact details for OCJbPIJvBK4nK2yWoMw9
Fetch contact OCJbPIJvBK4nK2yWoMw9
```

**What to Expect:**
- Complete contact details including all custom fields
- Tags, tasks, and metadata
- Contact history and timeline

**Test Commands:**
1. First search for a contact: `search contact Manuel`
2. Copy the contact ID from results (e.g., `OCJbPIJvBK4nK2yWoMw9`)
3. Then: `Get contact OCJbPIJvBK4nK2yWoMw9`

**Parameter Requirements:**
- **contactId** (required) - 24-character alphanumeric ID

---

### 4. contacts_update-contact (Update Contact)

**Natural Language Examples:**
```
Update contact OCJbPIJvBK4nK2yWoMw9 with email newemail@example.com
Change phone for contact OCJbPIJvBK4nK2yWoMw9 to 813-555-9999
Update contact OCJbPIJvBK4nK2yWoMw9 with first name Michael
```

**What to Expect:**
- Success confirmation
- Updated contact object returned
- Changes immediately reflected

**Test Workflow:**
1. `search contact Alice` - Find contact
2. Note the contact ID
3. `Update contact [ID] with email alice.new@example.com`
4. `Get contact [ID]` - Verify changes

**Parameter Requirements:**
- **contactId** (required)
- Any field to update (email, phone, firstName, lastName, etc.)

---

### 5. contacts_upsert-contact (Create or Update Contact)

**Natural Language Examples:**
```
Upsert contact with email bob@company.com and name Bob Johnson
Create or update contact mike@test.com with phone 555-0123
```

**What to Expect:**
- Creates new contact if email doesn't exist
- Updates existing contact if email found
- Returns contact object with ID

**Test Commands:**
1. `Upsert contact with email testuser@example.com and name Test User`
2. Run same command again - should update existing contact
3. Verify by searching: `search contact testuser@example.com`

**Use Case:**
- Safe contact creation without duplicates
- Importing contacts from external sources
- Updating contact info when unsure if they exist

---

### 6. contacts_add-tags (Add Tags to Contact)

**Natural Language Examples:**
```
Add tags VIP, Premium to contact OCJbPIJvBK4nK2yWoMw9
Tag contact OCJbPIJvBK4nK2yWoMw9 with Hot Lead
Add tag Newsletter to contact OCJbPIJvBK4nK2yWoMw9
```

**What to Expect:**
- Tags immediately added to contact
- Confirmation message
- Tags visible in contact details

**Test Workflow:**
1. `search contact Manuel` - Find contact
2. Note contact ID
3. `Add tags VIP, TestTag to contact [ID]`
4. `Get contact [ID]` - Verify tags appear

**Parameter Requirements:**
- **contactId** (required)
- **tags** (required) - Array of tag strings

---

### 7. contacts_remove-tags (Remove Tags from Contact)

**Natural Language Examples:**
```
Remove tags VIP, Premium from contact OCJbPIJvBK4nK2yWoMw9
Delete tag TestTag from contact OCJbPIJvBK4nK2yWoMw9
Untag Hot Lead from contact OCJbPIJvBK4nK2yWoMw9
```

**What to Expect:**
- Tags removed from contact
- Confirmation message
- Changes immediately reflected

**Test Workflow:**
1. First add tags: `Add tags TestTag1, TestTag2 to contact [ID]`
2. Verify: `Get contact [ID]`
3. Remove: `Remove tags TestTag1 from contact [ID]`
4. Verify again: `Get contact [ID]`

---

### 8. contacts_get-all-tasks (Get Contact Tasks)

**Natural Language Examples:**
```
Get tasks for contact OCJbPIJvBK4nK2yWoMw9
Show all tasks for contact OCJbPIJvBK4nK2yWoMw9
List tasks for contact OCJbPIJvBK4nK2yWoMw9
```

**What to Expect:**
- List of all tasks assigned to contact
- Task status (pending, completed)
- Due dates and descriptions

**Test Commands:**
1. `Get tasks for contact [ID]`
2. If no tasks exist, it will return empty array

**Parameter Requirements:**
- **contactId** (required)

---

## 💬 CONVERSATIONS (3 Tools)

### 9. conversations_search-conversation (Search Conversations)

**Natural Language Examples:**
```
Search conversations
Find conversations for contact OCJbPIJvBK4nK2yWoMw9
Show recent conversations
Search conversations with status open
```

**What to Expect:**
- List of conversation threads
- Contact info for each conversation
- Last message preview
- Conversation IDs for further actions

**Test Commands:**
1. `Search conversations` - Show all recent
2. `Find conversations for contact [contactId]` - Filter by contact

**Parameter Requirements:**
- **contactId** (optional) - Filter by specific contact
- **status** (optional) - Filter by status

---

### 10. conversations_get-messages (Get Messages from Conversation)

**Natural Language Examples:**
```
Get messages from conversation CNV123456789
Show messages for conversation CNV123456789
List messages in conversation CNV123456789 limit 10
```

**What to Expect:**
- Full message history
- Message content, timestamps
- Sender information (contact or user)
- Message type (SMS, Email, etc.)

**Test Workflow:**
1. `Search conversations` - Find conversation
2. Note conversation ID (e.g., `CNV123456789`)
3. `Get messages from conversation CNV123456789`

**Parameter Requirements:**
- **conversationId** (required)
- **limit** (optional) - Default 20 messages

---

### 11. conversations_send-a-new-message (Send Message)

**Natural Language Examples:**
```
Send SMS to conversation CNV123456789 with message "Hello!"
Send message to conversation CNV123456789: "Thanks for reaching out"
Reply to conversation CNV123456789 with "We'll follow up soon"
```

**What to Expect:**
- Message immediately sent
- Confirmation with message ID
- Message appears in conversation history

**Test Workflow:**
1. `Search conversations` - Find active conversation
2. `Send SMS to conversation [ID] with message "Test message from MCP"`
3. `Get messages from conversation [ID]` - Verify message sent

**Parameter Requirements:**
- **conversationId** (required)
- **type** (required) - Usually "SMS" or "Email"
- **message** (required) - Message content

---

## 🎯 OPPORTUNITIES (4 Tools)

### 12. opportunities_search-opportunity (Search Opportunities)

**Natural Language Examples:**
```
Search opportunities
Find opportunities with status open
Search opportunities in pipeline [pipelineId]
Show opportunities for contact OCJbPIJvBK4nK2yWoMw9
```

**What to Expect:**
- List of deals/opportunities
- Opportunity name, value, status
- Associated contact info
- Pipeline and stage details

**Test Commands:**
1. `Search opportunities` - All opportunities
2. `Find opportunities with status open` - Filter by status
3. `Search opportunities for contact [contactId]` - By contact

**Parameter Requirements:**
- **status** (optional)
- **pipelineId** (optional)
- **contactId** (optional)

---

### 13. opportunities_get-pipelines (Get Sales Pipelines)

**Natural Language Examples:**
```
Get pipelines
Show all pipelines
List sales pipelines
```

**What to Expect:**
- List of all sales pipelines
- Pipeline names and IDs
- Stages within each pipeline
- Pipeline configuration

**Test Commands:**
1. `Get pipelines` - Shows all pipelines
2. Note pipeline IDs for filtering opportunities

**Use Case:**
- Understanding sales process stages
- Filtering opportunities by pipeline
- Creating opportunities in specific pipelines

---

### 14. opportunities_get-opportunity (Get Single Opportunity)

**Natural Language Examples:**
```
Get opportunity OPP123456789
Show opportunity details for OPP123456789
Fetch opportunity OPP123456789
```

**What to Expect:**
- Complete opportunity details
- Contact information
- Deal value and status
- Custom fields and notes

**Test Workflow:**
1. `Search opportunities` - Find opportunity
2. Note opportunity ID
3. `Get opportunity [ID]` - Full details

**Parameter Requirements:**
- **opportunityId** (required)

---

### 15. opportunities_update-opportunity (Update Opportunity)

**Natural Language Examples:**
```
Update opportunity OPP123456789 with status won
Change opportunity OPP123456789 value to 5000
Update opportunity OPP123456789 stage to Negotiation
```

**What to Expect:**
- Updated opportunity object
- Changes immediately reflected
- Confirmation message

**Test Workflow:**
1. `Search opportunities` - Find opportunity
2. `Update opportunity [ID] with status open`
3. `Get opportunity [ID]` - Verify changes

**Parameter Requirements:**
- **opportunityId** (required)
- Fields to update (status, monetary_value, stage, etc.)

---

## 📅 CALENDAR (2 Tools)

### 16. calendars_get-calendar-events (Get Calendar Events)

**Natural Language Examples:**
```
Get calendar events for user USR123456
Show calendar events for calendar CAL123456
List events for user USR123456 in group GRP123456
```

**What to Expect:**
- List of scheduled appointments
- Event dates, times, and durations
- Appointment details and notes
- Associated contact information

**Test Commands:**
1. First get your user/calendar IDs from GoHighLevel
2. `Get calendar events for user [userId]`

**Parameter Requirements:**
- **userId** (optional but recommended)
- **groupId** (optional)
- **calendarId** (optional)

**Note:** You need actual user/calendar IDs from your GoHighLevel account.

---

### 17. calendars_get-appointment-notes (Get Appointment Notes)

**Natural Language Examples:**
```
Get appointment notes for APT123456789
Show notes for appointment APT123456789
Fetch appointment APT123456789 notes
```

**What to Expect:**
- All notes associated with appointment
- Note content and timestamps
- Who created each note

**Test Workflow:**
1. `Get calendar events for user [userId]` - Find appointment
2. Note appointment ID
3. `Get appointment notes for [appointmentId]`

**Parameter Requirements:**
- **appointmentId** (required)

---

## 📍 LOCATION (2 Tools)

### 18. locations_get-location (Get Location Details)

**Natural Language Examples:**
```
Get location details
Show location info
Fetch location data
Get my location settings
```

**What to Expect:**
- Complete location configuration
- Business name and address
- Contact information
- Timezone and settings
- Integrated services

**Test Commands:**
1. `Get location details` - Shows your Location ID `3lSeAHXNU9t09Hhp9oai` info

**Parameter Requirements:**
- **locationId** (auto-populated from connection)

**Use Case:**
- Verify location configuration
- Check business settings
- Audit location details

---

### 19. locations_get-custom-fields (Get Custom Fields)

**Natural Language Examples:**
```
Get custom fields
Show custom fields
List all custom fields
Fetch custom field definitions
```

**What to Expect:**
- List of all custom fields defined
- Field names, IDs, and types
- Field options (for dropdowns)
- Required/optional status

**Test Commands:**
1. `Get custom fields` - Lists all custom fields

**Parameter Requirements:**
- **locationId** (auto-populated)

**Use Case:**
- Understanding available custom fields
- Creating contacts with custom data
- Building forms and integrations

---

## 💳 PAYMENTS (2 Tools)

### 20. payments_get-order-by-id (Get Order Details)

**Natural Language Examples:**
```
Get order ORD123456789
Show order details for ORD123456789
Fetch order ORD123456789
```

**What to Expect:**
- Complete order information
- Order items and quantities
- Pricing and totals
- Payment status
- Customer information

**Test Commands:**
1. If you have an order ID: `Get order [orderId]`

**Parameter Requirements:**
- **orderId** (required)

**Note:** Requires existing orders in your GoHighLevel account.

---

### 21. payments_list-transactions (List Transactions)

**Natural Language Examples:**
```
List transactions
Show all transactions
Get recent transactions
List transactions for contact OCJbPIJvBK4nK2yWoMw9
```

**What to Expect:**
- List of payment transactions
- Transaction amounts and dates
- Payment methods
- Transaction status
- Associated contacts/orders

**Test Commands:**
1. `List transactions` - All recent transactions
2. `Show transactions for contact [contactId]` - Filter by contact

**Parameter Requirements:**
- **contactId** (optional)
- **startDate** (optional)
- **endDate** (optional)
- **status** (optional)

---

## 🔗 Advanced Multi-Tool Workflows

### Workflow 1: Complete Contact Onboarding
```
1. Add contact named Jennifer Smith with email jennifer@example.com and phone 813-555-1111
2. Add tags New Lead, Newsletter to contact [new-contact-id]
3. Send SMS to conversation [conversation-id] with message "Welcome Jennifer! We're excited to work with you."
4. Create opportunity for contact [contact-id] in pipeline [pipeline-id]
```

### Workflow 2: Lead Qualification Process
```
1. Search contact David
2. Get contact [contact-id] - Review full details
3. Add tags Qualified, Hot Lead to contact [contact-id]
4. Update opportunity [opp-id] with status open
5. Send SMS with message "Thanks for your interest! Let's schedule a call."
```

### Workflow 3: Deal Management
```
1. Search opportunities with status open
2. Get opportunity [opp-id] - Review details
3. Update opportunity [opp-id] with stage Negotiation
4. Get contact [contact-id] - Get client info
5. Send message: "Great news! We're moving forward with your proposal."
```

### Workflow 4: Contact Research & Outreach
```
1. Search contacts - Find target contact
2. Get contact [contact-id] - Review history
3. Get tasks for contact [contact-id] - Check pending items
4. Search conversations for contact [contact-id] - Review past communication
5. Send SMS with personalized message based on history
```

### Workflow 5: Sales Pipeline Analysis
```
1. Get pipelines - See all stages
2. Search opportunities in pipeline [pipeline-id]
3. Get opportunity [opp-id] - Review top deal
4. Get contact [contact-id] - Client details
5. Update opportunity with next action
```

---

## 🧪 Systematic Testing Checklist

### Phase 1: Contact Management (30 min)
- [ ] Create 3 new test contacts with different data combinations
- [ ] Search for each contact by name, email, phone
- [ ] Update each contact with new information
- [ ] Add tags to contacts
- [ ] Remove tags from contacts
- [ ] Get full details for each contact
- [ ] Retrieve tasks for contacts

### Phase 2: Communication (20 min)
- [ ] Search all conversations
- [ ] Get messages from active conversation
- [ ] Send test SMS message
- [ ] Verify message appears in conversation history

### Phase 3: Opportunities (20 min)
- [ ] List all pipelines
- [ ] Search opportunities
- [ ] Get details for specific opportunity
- [ ] Update opportunity status/stage
- [ ] Create new opportunity (if needed)

### Phase 4: Calendar & Events (15 min)
- [ ] Get calendar events (requires user ID)
- [ ] Get appointment notes for scheduled event

### Phase 5: Configuration (10 min)
- [ ] Get location details
- [ ] List all custom fields

### Phase 6: Payments (10 min)
- [ ] List transactions (if any exist)
- [ ] Get order details (if order ID available)

### Phase 7: Advanced Workflows (30 min)
- [ ] Complete onboarding workflow
- [ ] Lead qualification workflow
- [ ] Deal management workflow

---

## 📊 Expected Results Summary

| Tool Category | Tools Count | Expected Success Rate |
|--------------|-------------|---------------------|
| Contacts | 8 | 100% - All working |
| Conversations | 3 | 100% - All working |
| Opportunities | 4 | 95% - May need existing data |
| Calendar | 2 | 90% - Requires user/calendar IDs |
| Location | 2 | 100% - All working |
| Payments | 2 | 80% - Requires existing orders |

---

## 🐛 Troubleshooting

### "No results found"
- Check spelling and capitalization
- Try partial name search: `search contact Man` instead of `search contact Manuel`
- Remove filler words: use `search Manuel` not `search for contact Manuel`

### "Invalid contact ID"
- Contact IDs are 24-character alphanumeric
- Always search first to get correct ID
- Copy-paste IDs to avoid typos

### "MCP call failed"
- Check connection status at top of page
- Reconnect if needed
- Verify API key and Location ID are correct

### "Tags not appearing"
- Tags may take a few seconds to sync
- Refresh contact details: `Get contact [ID]`
- Check tag spelling (case-sensitive)

---

## 🎯 Success Criteria

After completing all tests, you should be able to:

✅ Create, read, update contacts via natural language
✅ Search contacts by any field
✅ Manage contact tags efficiently
✅ Send SMS messages to contacts
✅ View and manage opportunities
✅ Access calendar events and notes
✅ Retrieve location and custom field configuration
✅ List transactions and orders
✅ Execute multi-step workflows combining multiple tools

---

## 📝 Notes

- All natural language commands are parsed and mapped to official MCP tools
- System automatically handles JSON-RPC protocol formatting
- Responses are parsed from Server-Sent Events (SSE) format
- REST API fallback activates if MCP call fails
- All tools use Location ID: `3lSeAHXNU9t09Hhp9oai`
- Authentication via Private Integration Token: `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`

---

## 🔗 Additional Resources

- **MCP Copilot UI**: https://ringlypro-crm.onrender.com/mcp-copilot/
- **Health Check**: https://ringlypro-crm.onrender.com/api/mcp/health
- **GoHighLevel Docs**: https://docs.gohighlevel.com
- **MCP Protocol Spec**: https://modelcontextprotocol.io

---

**Generated**: 2025-10-12
**Version**: 1.0
**Status**: ✅ All 21 tools tested and working
