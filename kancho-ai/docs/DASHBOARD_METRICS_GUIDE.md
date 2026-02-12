# Kancho AI Dashboard Metrics Guide

This document explains each metric displayed on the Kancho AI dashboard, how it's calculated, and what it means for your martial arts school business.

---

## Overview

The Kancho AI dashboard provides a comprehensive view of your school's business health through key performance indicators (KPIs). These metrics help you understand where your business is thriving, where you're at risk of losing revenue, and where your growth opportunities lie.

---

## Business Health Section

### Health Score (0-100)

**What it is:** A single number that represents the overall health of your business.

**How it's calculated:**
The health score is a weighted combination of three factors:
- **Retention Score** (40%) - How well you're keeping existing students
- **Revenue Score** (30%) - How your revenue compares to targets
- **Lead Score** (30%) - How effectively you're generating and converting leads

**How to interpret it:**
| Score Range | Grade | Meaning |
|-------------|-------|---------|
| 90-100 | A | Excellent - Your business is thriving |
| 80-89 | B | Strong - Business is healthy with minor areas to improve |
| 70-79 | C | Stable - Some attention needed |
| 60-69 | D | At Risk - Significant issues require action |
| Below 60 | F | Critical - Immediate intervention needed |

---

### Revenue at Risk

**What it is:** The dollar amount of monthly recurring revenue you could lose if at-risk students cancel their memberships.

**How it's calculated:**
```
Revenue at Risk = Number of At-Risk Students × Average Revenue Per Student (ARPS)
```

**Example:**
- You have 27 students showing signs of leaving
- Your average membership is $175/month
- Revenue at Risk = 27 × $175 = **$4,725**

**What makes a student "at-risk":**
- Declining attendance (missing classes for 2+ weeks)
- Payment failures or late payments
- Reduced engagement compared to their normal pattern
- Approaching contract end date without renewal

---

### Growth Potential

**What it is:** The potential monthly revenue you could gain by converting your hottest leads into paying members.

**How it's calculated:**
```
Growth Potential = Number of Hot Leads × Average Revenue Per Student (ARPS)
```

**Example:**
- You have 14 hot leads ready to convert
- Your average membership is $175/month
- Growth Potential = 14 × $175 = **$2,450**

---

### Monthly Revenue

**What it is:** Your total revenue collected for the current month.

**How it's calculated:**
Sum of all payments received during the current calendar month.

**What's displayed:**
- The dollar amount (e.g., $74,858)
- Percentage of your monthly target (e.g., 115% of target)

---

## Key Performance Indicators (KPI) Section

### Active Students

**What it is:** The total count of currently enrolled, paying members.

**How it's calculated:**
Count of all students with `status = 'active'` in the system.

**What's displayed:**
- Total active student count
- Net growth indicator (e.g., "+3 net growth" or "-2 net growth")

---

### Net Student Growth

**What it is:** The change in your student base for the current month.

**How it's calculated:**
```
Net Student Growth = New Students Enrolled - Students Who Cancelled
```

**Example:**
- 8 new students joined this month
- 3 students cancelled
- Net Growth = 8 - 3 = **+5 students**

**Interpretation:**
- Positive number = Your school is growing
- Zero = Your enrollment is stable
- Negative number = You're losing more students than you're gaining

---

### Churn Rate

**What it is:** The percentage of students who cancel their membership each month.

**How it's calculated:**
```
Churn Rate = (Number of Cancellations ÷ Students at Start of Month) × 100
```

**Example:**
- You started the month with 100 students
- 5 students cancelled during the month
- Churn Rate = (5 ÷ 100) × 100 = **5%**

**Industry benchmarks:**
| Churn Rate | Assessment | Color Code |
|------------|------------|------------|
| Below 5% | Excellent | Green |
| 5% - 10% | Average | Amber |
| Above 10% | Needs Attention | Red |

**Why it matters:**
A 5% monthly churn rate means you're losing about 60% of your students per year. Reducing churn from 10% to 5% can dramatically improve profitability.

---

### Average Revenue Per Student (ARPS)

**What it is:** The average amount each student pays per month.

**How it's calculated:**
```
ARPS = Total Monthly Revenue ÷ Number of Active Students
```

**Example:**
- Monthly revenue: $52,500
- Active students: 300
- ARPS = $52,500 ÷ 300 = **$175**

**Why it matters:**
ARPS helps you understand the value of each student and is used to calculate Revenue at Risk and Growth Potential.

---

### Trial Conversion Rate

**What it is:** The percentage of trial students who become paying members.

**How it's calculated:**
```
Trial Conversion Rate = (Trials Converted ÷ Total Trials Started) × 100
```

**Example:**
- 20 people started a trial this month
- 12 of them became paying members
- Conversion Rate = (12 ÷ 20) × 100 = **60%**

**Industry benchmarks:**
| Conversion Rate | Assessment |
|-----------------|------------|
| 70%+ | Excellent |
| 50-69% | Good |
| 30-49% | Average |
| Below 30% | Needs Work |

---

### Revenue vs Target

**What it is:** How your actual revenue compares to your monthly goal.

**How it's calculated:**
```
Revenue vs Target = (Actual Monthly Revenue ÷ Monthly Revenue Target) × 100
```

**Example:**
- Monthly revenue: $74,858
- Target: $65,000
- vs Target = ($74,858 ÷ $65,000) × 100 = **115.2%**

**Color coding:**
| Percentage | Assessment | Color |
|------------|------------|-------|
| 100%+ | Exceeding goal | Green |
| 80-99% | Close to goal | Amber |
| Below 80% | Below target | Red |

---

## Lead Scoring System

### What is a Lead Score?

A lead score (0-100) predicts how likely a prospect is to become a paying member.

### Lead Temperature Categories

| Temperature | Score Range | Probability | Meaning |
|-------------|-------------|-------------|---------|
| **Hot** | 80-100 | 25% of leads | Ready to buy - prioritize contact |
| **Warm** | 50-79 | 50% of leads | Interested but needs nurturing |
| **Cold** | 20-49 | 25% of leads | Early stage - needs more engagement |

### What Makes a Lead "Hot"?

A lead is considered hot when they show strong buying signals:
- Visited multiple times or spent significant time on website
- Submitted contact forms or requested information
- Responded to outreach calls/emails
- Asked about pricing or class schedules
- Referred by a current member
- Has a clear timeline to start

---

## At-Risk Student Detection

### Churn Risk Levels

| Risk Level | Meaning |
|------------|---------|
| **Critical** | Very likely to cancel within 30 days |
| **High** | Showing multiple warning signs |
| **Medium** | Some concerning patterns |
| **Low** | Engaged and likely to stay |

### Warning Signs That Increase Churn Risk

1. **Attendance Decline**
   - Missing 2+ consecutive weeks
   - Attending less than half of usual classes

2. **Payment Issues**
   - Failed payment attempts
   - Late payments
   - Downgrading membership

3. **Engagement Drop**
   - Not responding to communications
   - Stopped participating in events
   - Negative feedback or complaints

4. **Contract Factors**
   - Contract ending soon without renewal discussion
   - Past initial commitment period

---

## Dashboard Lists

### At-Risk Members List

Shows the top 5 students with the highest churn risk, including:
- Student name
- Risk level (Critical/High)
- Days since last attendance
- Recommended action (call, offer discount, etc.)

### Hot Leads List

Shows the top 5 leads most likely to convert, including:
- Lead name
- Contact information
- Lead score
- Current status in sales pipeline

### Follow-Up Needed List

Shows leads with overdue follow-up dates that need immediate attention.

---

## Voice AI Reporting

When you talk to Kancho, it reports these metrics in a conversational format:

**Example response:**
> "Your business health score is 67 out of 100, which is a grade D. There are 27 students at risk, representing about $4,700 in revenue. On the positive side, you have 14 hot leads worth around $2,400 in potential growth. Monthly revenue is at $74,800, which is 115 percent of your target."

---

## Data Sources

All metrics are calculated from your integrated systems:
- **Student data**: From your CRM or membership management system
- **Revenue data**: From your payment processor
- **Lead data**: From your lead capture forms and CRM
- **Attendance data**: From your check-in system

---

## Recommended Actions Based on Metrics

| If you see... | Consider... |
|---------------|-------------|
| Health Score below 60 | Immediate focus on retention and lead generation |
| High Revenue at Risk | Launch retention campaign for at-risk students |
| Low Trial Conversion | Review your trial experience and follow-up process |
| Churn Rate above 10% | Analyze why students are leaving and address root causes |
| Many Hot Leads | Prioritize lead follow-up calls |
| Revenue below target | Review pricing, increase marketing, or reduce churn |

---

## Glossary

| Term | Definition |
|------|------------|
| **ARPS** | Average Revenue Per Student - monthly revenue divided by active students |
| **Churn** | When a student cancels their membership |
| **Churn Rate** | Percentage of students who cancel each month |
| **Hot Lead** | A prospect with 80-100 lead score, likely to convert |
| **KPI** | Key Performance Indicator - important business metrics |
| **Net Growth** | New enrollments minus cancellations |
| **Revenue at Risk** | Potential revenue loss from at-risk students |
| **Trial Conversion** | Percentage of trial students who become members |

---

*Last updated: February 2026*
*For questions or support, contact support@ringlypro.com*
