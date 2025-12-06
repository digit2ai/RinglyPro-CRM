# Photo Studio - Design Brief Implementation Checklist

## ✅ Backend (COMPLETED)

- [x] Create `photo_studio_design_briefs` table migration
- [x] Create `photo_studio_ai_outputs` table migration
- [x] Create MCP Client service (`src/services/mcpClient.js`)
- [x] Add Design Brief endpoints (POST/PUT/GET)
- [x] Add AI Assistant endpoints (POST for generate, GET for list)
- [x] Create migration runner script
- [x] Write comprehensive implementation guide
- [x] Commit and push to GitHub

## 📋 Frontend (TODO - Code Ready in Guide)

### Customer Portal (`views/photo-studio-portal.ejs`)

- [ ] Add global variable: `let designBriefs = {};`
- [ ] Add `loadDesignBrief(orderId)` function
- [ ] Add `renderDesignBriefCard(orderId)` function
- [ ] Add `renderDesignBriefForm(orderId, existingData)` function
- [ ] Add `renderDesignBriefView(brief)` function
- [ ] Add `saveDesignBrief(orderId)` function
- [ ] Add `editDesignBrief(orderId)` function
- [ ] Add `showBriefMessage(orderId, message, type)` function
- [ ] Call `loadDesignBrief()` in `selectOrder()` function
- [ ] Insert Design Brief card in `renderOrderDetails()` after Order Summary

### Success Page (`views/photo-studio-success.ejs`)

- [ ] Add "Next Step: Complete Your Design Brief" section
- [ ] Add button linking to `/photo-studio-portal?orderId=<%= orderId %>`
- [ ] Style with blue background (#eff6ff) and border

### Admin Dashboard (`views/photo-studio-admin-dashboard.ejs`)

- [ ] Add `renderAdminDesignBriefPanel(brief)` function
- [ ] Add `renderAIDesignAssistantPanel(orderId)` function
- [ ] Add `generateAIContent(orderId)` function
- [ ] Add `renderAIOutput(orderId, data)` function
- [ ] Add `renderAIContentByMode(mode, content)` function
- [ ] Add `renderMenuContent(content)` function
- [ ] Add `renderFlyerContent(content)` function
- [ ] Add `renderSocialContent(content)` function
- [ ] Add `copyToClipboard(elementId)` function
- [ ] Add `loadAIHistory(orderId)` function
- [ ] Insert Design Brief panel in order details rendering
- [ ] Insert AI Assistant panel after Design Brief panel
- [ ] Add warning for missing design brief

## 🗄️ Database (TODO - Scripts Ready)

### Development
```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM
node scripts/run-design-brief-migration.js
```

### Production
```bash
# Option 1: Create production script
node scripts/run-design-brief-migration-prod.js

# Option 2: Direct psql
psql "postgresql://ringlypro_admin:..." -f migrations/create-photo-studio-design-briefs.sql
psql "postgresql://ringlypro_admin:..." -f migrations/create-photo-studio-ai-outputs.sql
```

- [ ] Run migrations on development database
- [ ] Run migrations on production database
- [ ] Verify tables created with `\dt` in psql
- [ ] Check foreign key constraints

## ⚙️ Configuration (TODO)

### Environment Variables

**Development (.env file):**
```bash
MCP_SERVER_URL=http://localhost:3001
MCP_API_KEY=optional-key-here
```

**Production (Render Dashboard):**
- [ ] Go to Render dashboard → ringlypro-crm service
- [ ] Environment → Add Environment Variable
- [ ] Add `MCP_SERVER_URL` = `http://your-mcp-server-url`
- [ ] Add `MCP_API_KEY` = `your-api-key` (if needed)
- [ ] Save changes

## 🧪 Testing (TODO)

### Customer Flow
- [ ] Create new Photo Studio order
- [ ] Complete Stripe checkout
- [ ] View success page - verify Design Brief CTA appears
- [ ] Click "Go to My Portal & Design Brief"
- [ ] Fill out design brief form with all required fields
- [ ] Submit form - verify success message
- [ ] Refresh page - verify brief persists
- [ ] Click "Edit Brief" - verify form pre-fills
- [ ] Update brief - verify changes save
- [ ] Check database - verify record in `photo_studio_design_briefs`

### Admin Flow
- [ ] Login to admin dashboard (mstagg@digit2ai.com or pixlypro@digit2ai.com)
- [ ] Select order with design brief
- [ ] Verify Design Brief panel displays correctly
- [ ] Verify all brief fields are visible and readable
- [ ] Test AI Assistant:
  - [ ] Select "Menu Copy" mode
  - [ ] Add extra instructions
  - [ ] Click "Generate with AI"
  - [ ] Verify loading state appears
  - [ ] Verify output displays (or fallback if MCP offline)
  - [ ] Click "Copy" button - verify clipboard
  - [ ] Test "Flyer" mode
  - [ ] Test "Social Media" mode
  - [ ] Test "Generic" mode
- [ ] Check AI History section - verify previous generations appear
- [ ] Check database - verify records in `photo_studio_ai_outputs`

### Error Handling
- [ ] Test without design brief - verify warning message
- [ ] Test with invalid form data - verify validation messages
- [ ] Test with MCP server offline - verify fallback content
- [ ] Test as non-admin user - verify cannot access AI endpoints
- [ ] Test as wrong user - verify cannot access other user's briefs

## 📚 Documentation (TODO)

- [ ] Read `DESIGN_BRIEF_IMPLEMENTATION_GUIDE.md`
- [ ] Review all JavaScript functions
- [ ] Understand HTML/CSS structure
- [ ] Review API endpoints and payloads
- [ ] Understand MCP integration flow

## 🚀 Deployment (TODO)

### Pre-deployment
- [ ] Test all features locally
- [ ] Run migrations on development
- [ ] Verify no console errors
- [ ] Test on mobile viewport
- [ ] Review all code changes

### Deployment
- [ ] Commit frontend changes to git
- [ ] Push to GitHub main branch
- [ ] Monitor Render deployment (2-5 minutes)
- [ ] Run migrations on production database
- [ ] Add environment variables to Render
- [ ] Test on production URL

### Post-deployment
- [ ] Create test order on production
- [ ] Fill out design brief
- [ ] Test AI generation (if MCP configured)
- [ ] Monitor server logs for errors
- [ ] Test with real customer (if available)

## 📊 Verification Queries

### Check Tables Exist
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE '%photo%brief%'
   OR table_name LIKE '%ai_output%';
```

### Check Design Briefs
```sql
SELECT
    db.id,
    db.business_name,
    db.business_type,
    db.primary_design_need,
    o.id as order_id,
    o.order_status
FROM photo_studio_design_briefs db
JOIN photo_studio_orders o ON db.order_id = o.id
ORDER BY db.created_at DESC
LIMIT 10;
```

### Check AI Outputs
```sql
SELECT
    id,
    order_id,
    mode,
    model_name,
    created_at
FROM photo_studio_ai_outputs
ORDER BY created_at DESC
LIMIT 10;
```

## 🐛 Common Issues & Solutions

### Issue: Tables not created
**Solution:** Run migration script again, check for SQL errors

### Issue: MCP server connection fails
**Solution:** Check MCP_SERVER_URL, verify server is running, check fallback content appears

### Issue: Design brief not saving
**Solution:** Check browser console for errors, verify JWT token, check network tab

### Issue: AI generation fails
**Solution:** Check admin permissions, verify brief exists, test fallback mode

### Issue: Frontend code not updating
**Solution:** Hard refresh (Ctrl+Shift+R), clear browser cache, check EJS syntax

## 📞 Support

**Documentation:**
- `DESIGN_BRIEF_IMPLEMENTATION_GUIDE.md` - Complete frontend code
- `DESIGN_BRIEF_SUMMARY.md` - Feature overview
- `DESIGN_BRIEF_CHECKLIST.md` - This file

**Code Files:**
- Backend: `src/routes/photo-studio.js` (lines 1717-2238)
- MCP Client: `src/services/mcpClient.js`
- Migrations: `migrations/create-photo-studio-*.sql`

**Questions?**
- Review implementation guide
- Check browser console for errors
- Check server logs for backend errors
- Verify database migrations ran successfully

---

## ✨ Quick Start

1. **Run migrations:** `node scripts/run-design-brief-migration.js`
2. **Add environment variable:** `MCP_SERVER_URL=http://localhost:3001`
3. **Copy code from guide** to frontend views
4. **Test locally** before deploying
5. **Deploy:** `git push origin main`

That's it! 🎉
