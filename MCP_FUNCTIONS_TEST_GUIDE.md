# MCP Copilot - Function Testing Guide

Your RinglyPro MCP integration has **28 functions** implemented. Here's how to test each one:

## Access the MCP Copilot
**URL**: https://aiagent.ringlypro.com/mcp-copilot/?client_id=YOUR_CLIENT_ID

Replace `YOUR_CLIENT_ID` with your actual client ID from the database.

---

## 📞 CONTACTS (9 Functions)

### 1. Search Contacts
**Command**: `search Manuel`
**What it does**: Finds contacts matching "Manuel" (name or email)
**Expected**: Returns up to 5 contacts, most relevant first

### 2. Create Contact
**Command**: `create contact named Bob Johnson with email bob@company.com and phone 727-555-9999`
**What it does**: Creates a new contact in GoHighLevel
**Expected**: Success message with contact ID

### 3. Get Contact
**Command**: `get contact CONTACT_ID`
**What it does**: Retrieves full details of a specific contact
**Expected**: Contact name, email, phone, tags, custom fields

### 4. Update Contact
**Command**: `update contact CONTACT_ID with phone 555-1234`
**What it does**: Updates contact information
**Expected**: Confirmation of update

### 5. Upsert Contact
**Command**: `upsert contact email john@example.com with name John Doe`
**What it does**: Creates if doesn't exist, updates if exists
**Expected**: Contact created or updated

### 6. Add Tags
**Command**: `add tags VIP, Customer to contact CONTACT_ID`
**What it does**: Adds one or more tags to a contact
**Expected**: Tags added confirmation

### 7. Remove Tags
**Command**: `remove tag VIP from contact CONTACT_ID`
**What it does**: Removes tags from a contact
**Expected**: Tags removed confirmation

### 8. Get All Tasks
**Command**: `get tasks for contact CONTACT_ID`
**What it does**: Lists all tasks/todos for a contact
**Expected**: List of pending and completed tasks

### 9. Find Contact by Email
**Command**: `search bob@company.com`
**What it does**: Exact email search
**Expected**: Single contact with that email

---

## 💰 OPPORTUNITIES/DEALS (6 Functions)

### 10. Search Opportunities
**Command**: `search opportunities`
**What it does**: Lists all deals/opportunities
**Expected**: Active opportunities with names, values, stages

### 11. Get Opportunities (with filters)
**Command**: `show deals in Sales pipeline`
**What it does**: Filtered opportunity search
**Expected**: Deals matching filter criteria

### 12. Get Opportunity
**Command**: `get opportunity OPP_ID`
**What it does**: Full details of a specific deal
**Expected**: Deal name, value, stage, contact, notes

### 13. Update Opportunity
**Command**: `update opportunity OPP_ID status to won`
**What it does**: Changes deal status/stage
**Expected**: Opportunity updated confirmation

### 14. Get Pipelines
**Command**: `show all pipelines`
**What it does**: Lists all sales pipelines and their stages
**Expected**: Pipeline names and stage lists

### 15. Create Opportunity
**Command**: `create deal for CONTACT_ID value $5000 in Sales pipeline`
**What it does**: Creates new deal/opportunity
**Expected**: New opportunity ID and confirmation

---

## 💬 CONVERSATIONS & MESSAGING (5 Functions)

### 16. Search Conversations
**Command**: `show conversations for contact CONTACT_ID`
**What it does**: Lists all message threads for a contact
**Expected**: SMS, email, and chat conversations

### 17. Get Messages
**Command**: `show messages in conversation CONV_ID`
**What it does**: Displays conversation history
**Expected**: Message thread with timestamps

### 18. Send Message
**Command**: `send message to conversation CONV_ID: Hello!`
**What it does**: Sends message in existing conversation
**Expected**: Message sent confirmation

### 19. Send SMS
**Command**: `send sms to CONTACT_ID: Your appointment is confirmed`
**What it does**: Sends SMS to contact's phone
**Expected**: SMS queued/sent confirmation

### 20. Send Email
**Command**: `send email to CONTACT_ID subject "Follow up" body "Thanks for meeting"`
**What it does**: Sends email to contact
**Expected**: Email sent confirmation

---

## 📅 CALENDAR & APPOINTMENTS (4 Functions)

### 21. Get Calendar Events
**Command**: `show calendar events for user USER_ID`
**What it does**: Lists appointments/events
**Expected**: Scheduled appointments with dates/times

### 22. Get Appointment Notes
**Command**: `get notes for appointment APPT_ID`
**What it does**: Shows internal notes for an appointment
**Expected**: Notes and comments

### 23. Get Calendars
**Command**: `list all calendars`
**What it does**: Shows all calendar resources
**Expected**: Calendar names and IDs

### 24. Create Appointment
**Command**: `book appointment for CONTACT_ID on 2024-03-15 at 2:00 PM`
**What it does**: Creates new calendar appointment
**Expected**: Appointment created with confirmation

---

## 🏢 LOCATION & SETTINGS (3 Functions)

### 25. Get Location
**Command**: `show location info`
**What it does**: Displays GoHighLevel location details
**Expected**: Location name, address, settings

### 26. Get Custom Fields
**Command**: `show custom fields`
**What it does**: Lists all custom fields available
**Expected**: Field names, types, and values

### 27. Get Order
**Command**: `get order ORDER_ID`
**What it does**: Retrieves order/invoice details
**Expected**: Order items, total, status

---

## 💳 PAYMENTS & WORKFLOWS (2 Functions)

### 28. List Transactions
**Command**: `show recent transactions`
**What it does**: Lists payment transactions
**Expected**: Transaction history with amounts

### 29. Add to Workflow
**Command**: `add contact CONTACT_ID to workflow WORKFLOW_ID`
**What it does**: Enrolls contact in automation workflow
**Expected**: Contact added to workflow

---

## 🧪 Quick Test Script

Try these in order to test core functionality:

```
1. search Manuel
2. create contact named Test User with email test@example.com
3. search test@example.com
4. add tag TestTag to contact [ID from step 3]
5. show all pipelines
6. search opportunities
7. show conversations
8. list all calendars
9. show location info
10. show custom fields
```

---

## 📊 Testing Tips

1. **Start Simple**: Begin with search and view commands
2. **Test Creation**: Create a test contact first, then use it for other operations
3. **Check IDs**: Save contact/opportunity IDs for update/delete operations
4. **Watch Console**: Open browser DevTools to see API responses
5. **Natural Language**: The copilot accepts natural language variations

---

## 🔧 Troubleshooting

**"Not connected"**: Make sure your GoHighLevel API credentials are configured in Settings
**"404 Not found"**: The ID you're using doesn't exist
**"Permission denied"**: Your API key might not have the required permissions
**No results**: Try broader search terms

---

## 📝 Notes

- All functions use the official GoHighLevel MCP Protocol when available
- Falls back to REST API if MCP fails
- Results are automatically sorted by relevance
- Limits are enforced (default 5 for search, 20 for messages)

---

**Total Functions Available**: 29 (including callMCP and callAPI helpers)
**Direct User Functions**: 28
**Most Commonly Used**: Search, Create Contact, Send SMS, Get Opportunities
