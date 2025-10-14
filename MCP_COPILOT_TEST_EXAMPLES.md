# MCP Copilot Test Examples

## 📋 Contact Operations

### Create Contact
```
create contact TestUser phone 8136414177
create contact John Smith phone 5551234567 email john@example.com
create new contact named Sarah Johnson phone 7275559999
```

### Search Contact
```
search TestUser
search 813
search john@example.com
find contact 8136414177
```

### Update Contact
```
update contact TestUser phone 5551234567
update john@example.com with phone 8136414177
change contact Sarah email sarah.j@company.com
```

### Add Tags
```
add tag VIP to contact TestUser
tag john@example.com as lead
add tags hot-lead, interested to 8136414177
```

### Remove Tags
```
remove tag VIP from TestUser
untag john@example.com as lead
remove tags hot-lead from 8136414177
```

## 💬 Communication Operations

### Send SMS
```
send sms to 8136414177 saying this is a test
text 5551234567: Hello, this is a reminder
send message to TestUser: Your appointment is tomorrow
sms john@example.com saying Thanks for your interest!
```

### Send Email
```
send email to john@example.com subject Meeting Reminder body Don't forget our call tomorrow
email TestUser about Follow-up with message Thanks for connecting!
send email to 8136414177 subject Welcome with body Welcome to our service
```

## 📅 Calendar & Appointment Operations

### List Calendars
```
show calendars
list my calendars
what calendars do I have
```

### View Calendar Events
```
show calendar events
list appointments
what's on my calendar
```

### Book Appointment
```
book appointment for TestUser tomorrow at 2pm
schedule meeting with john@example.com on Friday at 10am
create appointment for 8136414177 next Monday 3pm
```

### Send Appointment Reminder
```
send appointment reminder to TestUser
remind john@example.com about their appointment
send reminder to 8136414177 for tomorrow's meeting
```

## 💰 Opportunity Operations

### View Opportunities
```
show opportunities
list deals
what opportunities do we have
view pipeline
```

### Add Opportunity
```
add opportunity for TestUser value 5000 stage lead
create deal for john@example.com worth $10000
new opportunity for 8136414177 amount 2500
```

### Move Opportunity
```
move TestUser opportunity to qualified stage
update john@example.com deal to negotiation
change 8136414177 opportunity stage to closed-won
```

## 📞 Call Operations

### Log Call
```
log call with TestUser duration 15 minutes
record call to john@example.com for 30 mins
log phone call with 8136414177 about follow-up
```

### Make Call
```
call TestUser
dial 8136414177
make call to john@example.com
```

## ⭐ Review Operations

### Send Review Request
```
send review request to TestUser
ask john@example.com for a review
request review from 8136414177
```

## 📊 Dashboard & Reports

### View Dashboard
```
show dashboard
view reports
display analytics
what's my overview
```

## 🔍 Search Operations

### General Search
```
search test
find all contacts with tag VIP
search opportunities over $5000
list contacts created today
```

## 🏢 Location Operations

### View Location Info
```
show location
what's my location info
display location details
```

## 🧪 Complete Test Workflow Examples

### New Lead Workflow
```
1. create contact Mike Davis phone 7275551234 email mike@test.com
2. add tag new-lead to Mike Davis
3. send sms to 7275551234 saying Hi Mike, thanks for your interest!
4. add opportunity for Mike Davis value 3000 stage lead
5. book appointment for Mike Davis tomorrow at 2pm
6. send appointment reminder to Mike Davis
```

### Follow-up Workflow
```
1. search mike@test.com
2. log call with mike@test.com duration 20 minutes
3. update mike@test.com with tag hot-lead
4. move Mike Davis opportunity to qualified stage
5. send email to mike@test.com subject Next Steps body Let's schedule a demo
```

### Close Deal Workflow
```
1. search 7275551234
2. move Mike Davis opportunity to closed-won
3. send review request to mike@test.com
4. add tag customer to Mike Davis
5. send sms to 7275551234 saying Welcome aboard! We're excited to work with you.
```

## 📝 Notes

- **Phone formats supported**: `8136414177`, `813-641-4177`, `(813) 641-4177`, `+18136414177`
- **Contact identification**: Can use name, email, or phone number
- **Natural language**: Commands support various phrasings - be conversational!
- **Tags**: Can add multiple tags at once with comma separation
- **Dates**: Supports "tomorrow", "Friday", "next Monday", or specific dates

## ⚠️ Troubleshooting

If a command doesn't work:
1. Check contact exists: `search [name/phone/email]`
2. Verify phone format is valid (10 digits for US numbers)
3. Make sure contact was created successfully before trying SMS/email
4. Check Render logs for detailed error messages
