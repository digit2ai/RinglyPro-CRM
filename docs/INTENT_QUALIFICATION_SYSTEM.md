# RinglyPro Intent Qualification System
## Product Vision Document

**Version:** 1.1
**Date:** January 26, 2026
**Status:** Draft - Awaiting Review

---

## 1. Executive Summary

Transform the RinglyPro demo experience into a **"Show, Don't Tell"** model. Instead of explaining what RinglyPro does, Lina **demonstrates by becoming the receptionist for the prospect's business** in real-time.

The prospect experiences Lina answering calls about THEIR company, THEIR services, THEIR hours - creating an immediate "wow" moment and driving conversion.

---

## 2. Core Philosophy: Show, Don't Tell


### The Solution: Live Demonstration
- Prospect gives Lina their business info through conversation
- Lina immediately becomes THEIR receptionist
- Prospect hears Lina talking about THEIR services, handling THEIR calls
- **They experience the value instead of being told about it**

---

## 3. Demo Workflow (8 Steps)

### Step 1: Entry (Zero Friction)
- Prospect clicks "Talk to Lina"
- No form, no setup, no explanation
- Voice demo starts immediately

### Step 2: Context Setting
- Lina introduces herself briefly
- Lina sets expectation: *"I'm going to show you how I answer calls for your business."*
- This frames the interaction as a demonstration, not a sales call

### Step 3: Conversational Discovery
Lina asks a few short questions, one at a time:
1. Business name
2. What the business does / services
3. Business hours
4. Location
5. Any special instructions

All information is collected naturally in conversation, not via form fields.

### Step 4: Instant Personalization
- Lina stores the provided information in real time
- No pause, no confirmation screens
- Lina signals the transition: *"Perfect. Let me show you how I'd answer calls for your business."*

### Step 5: Live Demonstration ("Magic Moment")
Lina roleplays as the business's receptionist using the prospect's:
- Business name
- Services
- Location
- Hours

**Prospect hears Lina answering a simulated customer call as their business.**
This is the wow moment where value is proven, not explained.

### Step 6: Embedded Qualification
While demonstrating, Lina naturally asks:
- If calls are being missed
- Who currently answers the phone
- Approximate call volume

Qualification happens inside the experience, not as a separate step.

### Step 7: Conversion Prompt
After the demo, Lina guides next action:
- Book onboarding
- Get started now
- Ask questions or see another scenario (appointments, pricing, transfers)

The prospect is already convinced because they've seen it working.

### Step 8: Lead Capture & Follow-Up
- Discovered business info is stored automatically
- Lead is routed to signup, booking, or CRM
- No lost leads from abandoned forms

---

## 4. Current State

### User Journey Today
```
Social Media / Online → ringlypro.com → "Live Demo" Button → Form Page
                                                                ↓
                                              Fill out: Business Name
                                                        Website URL
                                                        Upload .txt file
                                                                ↓
                                              Click "Start Demo Call"
                                                                ↓
                                              Lina greets with provided info
```

### Current Limitations
1. **Friction:** Prospect must fill out a form before experiencing the product
2. **Passive:** Lina waits for info instead of gathering it conversationally
3. **No Lead Capture:** If prospect leaves mid-form, we lose them
4. **Delayed Value:** Prospect has to work before seeing the benefit

---

## 5. Target State Vision

### 5.1 Direct Demo Mode (Priority - No Form)

```
Social Media / Online → ringlypro.com → "Talk to Lina" Button
                                                ↓
                                    Lina opens IMMEDIATELY (no form)
                                                ↓
                                    Lina introduces herself and asks:
                                    "What's your business name?"
                                    "What do you do / what services?"
                                    "What are your hours?"
                                    "Anything special I should know?"
                                                ↓
                                    Lina IMMEDIATELY becomes their receptionist
                                    Using the info they just provided
                                                ↓
                                    Prospect experiences Lina handling a
                                    simulated call for THEIR business
                                                ↓
                                    Automatic conversion moment - they've
                                    already seen it working for them
```

### 5.2 The Magic Moment

After gathering basic info, Lina says something like:

> "Perfect! Now let me show you exactly how I'd answer calls for [Business Name].
> Pretend you're a customer calling your business..."

Then Lina demonstrates:

> "Thanks for calling [Business Name]! I'm Lina, the AI receptionist.
> I understand you offer [services they mentioned]. How can I help you today?"

**The prospect hears their own business being represented.** This is the conversion trigger.

---

## 6. Discovery Framework (What Lina Asks)

### Phase 1: Basic Business Info (Required)

| Question | Purpose | Example |
|----------|---------|---------|
| "What's your business name?" | Personalize greetings | "Johnson's Plumbing" |
| "What type of business / what do you do?" | Understand industry | "We're a plumbing company" |
| "What services do you offer?" | Knowledge base | "Drain cleaning, water heaters, emergency repairs" |
| "What are your business hours?" | Answer availability questions | "Mon-Fri 8am-6pm, emergencies 24/7" |
| "Where are you located?" | Handle location questions | "Miami, Florida - we serve all of Miami-Dade" |

### Phase 2: Optional Enhancements (If Time Allows)

| Question | Purpose |
|----------|---------|
| "How should I handle appointment requests?" | Demo booking capability |
| "What's your typical pricing range?" | Answer price questions |
| "Any promotions or specials running?" | Mention in calls |
| "Who should I transfer urgent calls to?" | Show call handling |

### Phase 3: Qualification (Woven Into Conversation)

| Question | Qualification Purpose |
|----------|----------------------|
| "How many calls do you typically get?" | Gauge volume/fit |
| "Are you missing calls currently?" | Identify pain point |
| "Who answers your phones now?" | Understand current solution |

---

## 7. Conversation Flow Example

### Direct Demo - Full Flow

```
[Prospect clicks "Talk to Lina" - no form, instant connection]

LINA: "Hi! I'm Lina. I'm going to show you exactly how I can answer
       calls for your business. First, what's your business name?"

PROSPECT: "Martinez Auto Repair"

LINA: "Martinez Auto Repair - great! And what services do you offer?
       Things like oil changes, brake repair, that kind of thing?"

PROSPECT: "Yeah, we do oil changes, brakes, engine diagnostics,
           and we specialize in German cars"

LINA: "Oh nice, German car specialists! BMW, Mercedes, Audi -
       that's a great niche. What are your business hours?"

PROSPECT: "Monday through Saturday, 8am to 5pm"

LINA: "Got it. And where are you located?"

PROSPECT: "We're in Austin, Texas on South Lamar"

LINA: "Perfect! I have everything I need. Now let me show you
       how I'd answer a call for Martinez Auto Repair.

       Go ahead - pretend you're a customer calling your shop.
       Ask me anything a customer would ask."

PROSPECT: "Uh, hi, do you work on BMWs?"

LINA: "Thanks for calling Martinez Auto Repair! Yes, we absolutely
       work on BMWs - in fact, we specialize in German vehicles
       like BMW, Mercedes, and Audi. We're located on South Lamar
       in Austin. Were you looking to schedule a service appointment?"

PROSPECT: "Wow, that's pretty good"

LINA: "Thanks! And I can do this 24/7, even when you're closed.
       Would you like to see how I handle appointment booking,
       or do you want to go ahead and get started with RinglyPro?"
```

---

## 8. Technical Requirements

### 8.1 Direct Demo Mode (New Page/Widget)

**Frontend:**
- New landing page or widget: `/demo` or `/talk-to-lina`
- Single "Start Conversation" button - no form fields
- Voice interface only (ElevenLabs WebRTC)
- Minimal UI - focus on the voice experience

**Backend:**
- New ElevenLabs agent or dynamic prompt for "Discovery Mode"
- System prompt that guides Lina through discovery questions
- Real-time prompt injection as Lina learns business info
- After discovery, switch to "Receptionist Mode" for demonstration

**Data Flow:**
```
User clicks Start → Lina asks questions →
Info stored in conversation context →
Lina switches to demo mode with that info →
Prospect experiences personalized demo
```

### 8.2 System Prompt Structure

```
PHASE 1 - DISCOVERY MODE:
You are Lina. Your job is to learn about the prospect's business
so you can demonstrate how you'd answer their calls.

Ask these questions naturally (one at a time):
1. Business name
2. Type of business / services
3. Business hours
4. Location
5. Any special info

PHASE 2 - DEMONSTRATION MODE:
Once you have the basics, say: "Now let me show you how I'd
answer calls for [business name]..."

Then roleplay as their receptionist. Use ALL the information
they gave you. Make it feel real and personalized.

PHASE 3 - CONVERSION:
After demonstrating, ask if they want to get started or
have any questions about using Lina for their business.
```

### 8.3 Enhanced Form Demo (Existing Page)

- Keep current form functionality
- Update Lina's prompt to be more proactive
- If info is missing, Lina asks during the call
- Add conversion guidance at the end

---

## 9. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to "wow moment" | N/A (form required) | < 2 minutes |
| Demo completion rate | Unknown | 80%+ |
| Demo → Signup conversion | Unknown | 20%+ |
| Demo → Book call conversion | Unknown | 30%+ |
| Average demo duration | Unknown | 3-5 min |

---

## 10. Implementation Phases

### Phase 1: Quick Win - Enhanced Form Demo
- Update Lina's system prompt with discovery questions
- Add demonstration flow ("Let me show you how I'd answer...")
- Add conversion guidance
- **Effort:** Prompt engineering only (1-2 days)

### Phase 2: Direct Demo Mode
- Create new `/talk-to-lina` page
- Build discovery → demonstration flow
- Dynamic context injection
- **Effort:** 1-2 weeks

### Phase 3: Lead Capture & Analytics
- Store discovered business info
- Track conversion funnel
- Integrate with CRM (GHL)
- **Effort:** Ongoing

---

## 11. Decisions Made

| Area | Decision |
|------|----------|
| **Bilingual Support** | GeoLocation Code - auto-detect language via IP |
| **Abuse Prevention** | NO limit - salesforce can use for demos |
| **CTA Execution** | Guide to aiagent.ringlypro.com → signup → book onboarding meeting |
| **Fallback Handling** | Re-direct to book a demo session |
| **Mobile UX** | Works now on mobile browser - keep it working |
| **ElevenLabs Setup** | Keep current agent, modify prompt if needed |

---

## 12. Key Differentiator

**Traditional Demo:** "Let me tell you what our product does..."
**Our Demo:** "Let me BE your receptionist right now and show you..."

The prospect doesn't hear about features - they EXPERIENCE them working for their business. This creates:
- Emotional connection (it's THEIR business)
- Immediate understanding (no explanation needed)
- Reduced objections (they've already seen it work)
- Higher conversion (the value is undeniable)

---

## 13. Next Steps

1. [ ] Review and approve this document
2. [ ] Finalize open questions
3. [ ] Write discovery system prompt for Lina
4. [ ] Test with current demo page (Phase 1)
5. [ ] Design Direct Demo page UI (Phase 2)
6. [ ] Build and launch Direct Demo

---

**Document Owner:** Manuel Stagg
**Last Updated:** January 26, 2026
Charlie0901