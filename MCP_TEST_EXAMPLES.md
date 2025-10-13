# GoHighLevel MCP Copilot - Test Examples

## 🎯 Quick Tests to Try

Now that your Location ID is correct (`3lSeAHXNU9t09Hhp9oai`), try these commands in the MCP Copilot!

**URL:** https://ringlypro-crm.onrender.com/mcp-copilot/

---

## 📋 Search/View Contacts

### Basic Search
```
search Manuel
```
**Expected:** Should find Manuel Stagg

```
search Francisco
```
**Expected:** Should find Francisco Serna

```
find Austin
```
**Expected:** Should find Austin Ashibuogwu

```
search contacts
```
**Expected:** List all contacts (up to 10)

### Search by Email
```
search manuelstagg@gmail.com
```

```
find bgiskyvision@gmail.com
```

### Search by Phone
```
search 813
```
**Expected:** Contacts with 813 area code

---

## ➕ Create Contacts

### Create with Name and Email
```
Create contact named John Doe with email john.doe@example.com
```

### Create with Name, Email, and Phone
```
Add contact named Jane Smith with email jane@test.com and phone 813-555-1234
```

### Create with Just Email
```
Create contact with email testuser@example.com
```

### Create with Company Name
```
Add contact named Bob Johnson with email bob@company.com and phone 727-555-9999
```

---

## 💰 View Opportunities/Deals

### View All Deals
```
view deals
```

```
show opportunities
```

### Search Opportunities
```
search opportunities
```

---

## 🏷️ Manage Tags (Advanced)

### Add Tags to Contact
First, you need a contact ID. After searching for a contact, note the ID, then:

```
Add tags "premium" and "hot-lead" to contact bS4O3MFGJBFRCPYQLYRp
```

---

## 📅 View Calendar/Appointments

### View Calendar Events
```
show calendar
```

```
view appointments
```

---

## 💬 Send Messages (Advanced)

### Send SMS
```
Send SMS to contact bS4O3MFGJBFRCPYQLYRp: Hi! This is a test message from the MCP Copilot.
```

---

## 🔥 Complete Workflow Examples

### Example 1: New Lead Workflow
```
1. search contact John
   → Check if already exists

2. Create contact named John Smith with email john@example.com and phone 813-555-0001
   → Creates new contact

3. view deals
   → See all opportunities
```

### Example 2: Search and Review
```
1. search contacts
   → List all contacts

2. search Francisco
   → Find specific contact

3. view deals
   → Review opportunities
```

### Example 3: Quick Contact Creation
```
1. Add contact named Sarah Williams with email sarah@test.com
   → Creates contact

2. search Sarah
   → Verify it was created
```

---

## 📊 What You Should See

### Successful Search Response
```
I found 1 contacts matching "Manuel".

• manuel stagg (manuelstagg@gmail.com)
```

### Successful Contact Creation
```
✅ Contact created successfully! John has been added to your CRM.
```

### Multiple Results
```
I found 5 contacts matching "contacts".

• francisco serna (bgiskyvision@gmail.com)
• austin ashibuogwu (austin.a@shieldscepter.com)
• manuel stagg (manuelstagg@gmail.com)
• rocio poulsen (rj@strateverage.com)
• lina villamizar (linastagg@gmail.com)
```

---

## 🐛 Troubleshooting

### If Search Returns 0 Results

**Check the logs for:**
```
🔍 Raw MCP result structure: ...
📄 Text content (first 200 chars): ...
📦 Parsed once: ...
✅ Found X contacts
```

If you see these logs with "Found X contacts" but still get 0 results, there's a parsing issue.

### If Connection Fails

Make sure you're using:
- **API Key:** `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
- **Location ID:** `3lSeAHXNU9t09Hhp9oai`

### If Creates Fail

Check that your Private Integration Token has these scopes:
- ✅ View/Edit Contacts
- ✅ View/Edit Conversations
- ✅ View/Edit Opportunities

---

## 🎯 Your Actual Contacts to Search For

Based on the MCP test, these contacts exist in your GHL:

1. **Francisco Serna**
   - Email: bgiskyvision@gmail.com
   - Phone: +12107716413

2. **Austin Ashibuogwu**
   - Email: austin.a@shieldscepter.com
   - Phone: +18472755515
   - Company: Shield & Scepter Capital

3. **Manuel Stagg** (you!)
   - Email: manuelstagg@gmail.com

4. **Rocio Poulsen**
   - Email: rj@strateverage.com
   - Phone: +19546829820

5. **Lina Villamizar**
   - Email: linastagg@gmail.com
   - Phone: +18134811925

Try searching for any of these!

---

## 💡 Pro Tips

### Natural Language Works!
All these variations work:
- "search Manuel"
- "find contact Manuel"
- "search for Manuel"
- "look for contacts named Manuel"

### Quick Actions Buttons
Click the quick action buttons for common tasks:
- 🔍 Search Contacts
- ➕ Create Contact
- 💰 View Deals

### Case Insensitive
Searching is case-insensitive:
- "manuel" = "Manuel" = "MANUEL"

---

## 📈 Next Steps After Testing

Once you confirm searches work:

1. **Test Creating** a contact
2. **Test Viewing** deals/opportunities
3. **Try Complex Queries** like searching by phone or email
4. **Explore Other Tools** (calendar, tasks, etc.)

---

**Test now at:** https://ringlypro-crm.onrender.com/mcp-copilot/

**Status:** Both deployments should be complete - try it now! 🚀
