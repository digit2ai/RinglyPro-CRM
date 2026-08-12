'use strict';

/**
 * THE JOBUP GROWTH PLAN — six months, as a checklist.
 *
 * WHAT THIS PLAN HONESTLY IS. Following it does not guarantee virality, and the
 * dashboard says so on its face rather than in a footnote. Virality is an
 * outcome of a product people want plus distribution; a plan can only make the
 * distribution deliberate and remove the excuses. What it does guarantee is
 * that six months from now you will know whether this works, instead of
 * wondering.
 *
 * WHY THE FIRST WEEK GATES EVERYTHING. JobUp has subscribers and no collected
 * revenue. Driving traffic into a funnel nobody has completed spends the one
 * thing you cannot buy back — first attention — on a diagnosis ten people could
 * have given you for free. Phase 0 is deliberately blocking.
 *
 * WHY IT IS DAILY FOR 30 DAYS AND WEEKLY AFTER. Nobody follows a hand-written
 * 180-item list, and pretending to know what you should do on day 137 would be
 * inventing work. The first month is where momentum is won or lost, so it is
 * specified day by day. Months two to six are weekly themes plus daily habits,
 * which is how the work actually behaves once it is running.
 *
 * Owner is either `you` (needs a human identity — accounts, posting, outreach)
 * or `me` (buildable). That split is real: an agent cannot open a Reddit
 * account and should not pretend to.
 */

const HABITS = [
  { id: 'h-reddit', text: 'One genuinely useful Reddit answer, no promotion', minutes: 15, owner: 'you' },
  { id: 'h-linkedin', text: 'One LinkedIn post from your personal feed', minutes: 10, owner: 'you' },
  { id: 'h-inbox', text: 'Check the Subscribers console; reply to anyone new the same day', minutes: 5, owner: 'you' },
];

/** Month 1, day by day. This is the month that decides the other five. */
const DAYS = [
  // ---- PHASE 0: prove the funnel ----
  { day: 1, phase: 0, tasks: [
    { text: 'List 20 people you can ask directly: ex-colleagues, HISPATEC contacts, Chamber members, family in job hunts', minutes: 30, owner: 'you' },
    { text: 'Walk the signup yourself end to end with a real card. Note every friction point', minutes: 30, owner: 'you' },
    { text: 'Instrument the funnel: where visitors abandon between landing, teaser and payment', minutes: 0, owner: 'me' },
  ] },
  { day: 2, phase: 0, tasks: [
    { text: 'Message the first 10 of your 20. Ask them to sign up and say what confused them', minutes: 45, owner: 'you' },
    { text: 'Fix whatever your own walkthrough surfaced yesterday', minutes: 0, owner: 'me' },
  ] },
  { day: 3, phase: 0, tasks: [
    { text: 'Follow up with anyone who started and did not finish. Ask the one question: what stopped you', minutes: 30, owner: 'you' },
    { text: 'Write down each drop-off reason verbatim. Do not paraphrase them into something easier to hear', minutes: 15, owner: 'you' },
  ] },
  { day: 4, phase: 0, tasks: [
    { text: 'Message the remaining 10', minutes: 45, owner: 'you' },
    { text: 'Ship the top drop-off fix', minutes: 0, owner: 'me' },
  ] },
  { day: 5, phase: 0, tasks: [
    { text: 'Count it: how many paid? If zero, the problem is the product or the price, not awareness', minutes: 20, owner: 'you' },
    { text: 'Decide: proceed, or spend next week fixing the funnel instead', minutes: 20, owner: 'you' },
  ] },
  { day: 6, phase: 0, tasks: [
    { text: 'Interview your happiest subscriber for 20 minutes. What would they tell a friend?', minutes: 30, owner: 'you' },
    { text: 'Write their words down. That sentence becomes your landing headline and your ad copy', minutes: 15, owner: 'you' },
  ] },
  { day: 7, phase: 0, tasks: [
    { text: 'Rest, or catch up. A plan you cannot sustain for six months is theatre', minutes: 0, owner: 'you' },
  ] },

  // ---- PHASE 1: free surface area ----
  { day: 8, phase: 1, tasks: [
    { text: 'Create the Product Hunt account and draft the JobUp listing (do not launch yet)', minutes: 45, owner: 'you' },
    { text: 'Ship the "Built with JobUp" footer on every subscriber site', minutes: 0, owner: 'me' },
  ] },
  { day: 9, phase: 1, tasks: [
    { text: 'Submit to AlternativeTo and SaaSHub — free, and heavily retrieved by AI engines', minutes: 40, owner: 'you' },
    { text: 'Build the public directory of opted-in subscriber sites', minutes: 0, owner: 'me' },
  ] },
  { day: 10, phase: 1, tasks: [
    { text: 'Submit to G2 and Capterra. Both take a while to approve, so start now', minutes: 45, owner: 'you' },
  ] },
  { day: 11, phase: 1, tasks: [
    { text: 'Submit to Slant and two niche job-tool directories you find by searching "best AI job search tools"', minutes: 40, owner: 'you' },
    { text: 'Turn on the blog engine for jobup.dev/blog', minutes: 0, owner: 'me' },
  ] },
  { day: 12, phase: 1, tasks: [
    { text: 'Ask your paying subscribers for one honest G2 review each. Never offer anything for it', minutes: 20, owner: 'you' },
  ] },
  { day: 13, phase: 1, tasks: [
    { text: 'Create the JobUp Facebook Page and Instagram Business account, link them', minutes: 45, owner: 'you' },
    { text: 'Connect both to the Social Poster and run a dry run', minutes: 15, owner: 'you' },
  ] },
  { day: 14, phase: 1, tasks: [
    { text: 'Review: 6 listings submitted? Footer live? Directory live? Fix what is not', minutes: 30, owner: 'you' },
  ] },

  // ---- PHASE 2: earn the right to talk ----
  { day: 15, phase: 2, tasks: [
    { text: 'Create or dust off your Reddit account. Read the rules of r/jobs, r/resumes, r/remotework', minutes: 30, owner: 'you' },
    { text: 'Answer three questions with real advice. Mention nothing of your own', minutes: 30, owner: 'you' },
  ] },
  { day: 16, phase: 2, tasks: [
    { text: 'Post on LinkedIn: your own JobUp site, what it does, what it cost you to build', minutes: 25, owner: 'you' },
  ] },
  { day: 17, phase: 2, tasks: [
    { text: 'Draft the listicle outreach list: authors of the top 10 "best job search sites" articles', minutes: 0, owner: 'me' },
    { text: 'Personalise the first 5 outreach emails. Generic ones get ignored', minutes: 40, owner: 'you' },
  ] },
  { day: 18, phase: 2, tasks: [
    { text: 'Send the first 5 outreach emails', minutes: 20, owner: 'you' },
    { text: 'Start the LinkedIn connector for the Social Poster', minutes: 0, owner: 'me' },
  ] },
  { day: 19, phase: 2, tasks: [
    { text: 'Find 5 university alumni groups on Facebook and request to join', minutes: 30, owner: 'you' },
  ] },
  { day: 20, phase: 2, tasks: [
    { text: 'Post the before/after: your resume, the matches it scored, the site it built. Screenshots, not claims', minutes: 30, owner: 'you' },
  ] },
  { day: 21, phase: 2, tasks: [
    { text: 'Review the week. Count Reddit answers, LinkedIn posts, outreach sent. Nine useful before one promotional', minutes: 20, owner: 'you' },
  ] },

  // ---- PHASE 3: content substrate ----
  { day: 22, phase: 3, tasks: [
    { text: 'Draft "How AI job matching actually scores your resume" — statistics, cited sources, direct quotes', minutes: 0, owner: 'me' },
    { text: 'Read it and cut anything you would not defend to a subscriber', minutes: 30, owner: 'you' },
  ] },
  { day: 23, phase: 3, tasks: [
    { text: 'Publish article 1 to jobup.dev/blog. Share it on LinkedIn and to one relevant subreddit thread', minutes: 30, owner: 'you' },
  ] },
  { day: 24, phase: 3, tasks: [
    { text: 'Send outreach emails 6 to 10', minutes: 25, owner: 'you' },
    { text: 'Draft "What an ATS actually sees when it reads your CV"', minutes: 0, owner: 'me' },
  ] },
  { day: 25, phase: 3, tasks: [
    { text: 'Publish article 2. Post the single most useful paragraph as a standalone LinkedIn post', minutes: 30, owner: 'you' },
  ] },
  { day: 26, phase: 3, tasks: [
    { text: 'Launch on Product Hunt. Tuesday to Thursday, 12:01am PT. Reply to every comment personally', minutes: 90, owner: 'you' },
  ] },
  { day: 27, phase: 3, tasks: [
    { text: 'Follow up on Product Hunt: thank everyone, answer every question, ship one thing someone asked for', minutes: 60, owner: 'you' },
  ] },
  { day: 28, phase: 3, tasks: [
    { text: 'Month 1 review: paid subscribers, listings live, articles published, outreach sent, replies received', minutes: 45, owner: 'you' },
    { text: 'Decide what to keep, what to drop, and what to double', minutes: 30, owner: 'you' },
  ] },
];

/** Months 2 to 6: weekly themes on top of the daily habits. */
const WEEKS = [
  { week: 5, month: 2, theme: 'Referral loop', tasks: [
    { text: 'Add a one-tap "share my JobUp site" button to the subscriber dashboard', owner: 'me' },
    { text: 'Email every subscriber their own site link and ask them to share it once', owner: 'you' },
    { text: 'Publish article 3', owner: 'you' },
  ] },
  { week: 6, month: 2, theme: 'Answer the questions people actually ask', tasks: [
    { text: 'Search "best AI job search tool" on Perplexity and note which sources it cites', owner: 'you' },
    { text: 'Write one page answering the exact question those sources rank for', owner: 'me' },
    { text: 'Outreach emails 11 to 20', owner: 'you' },
  ] },
  { week: 7, month: 2, theme: 'Comparison pages', tasks: [
    { text: 'Publish "JobUp vs [the tool people actually name]" — fair, not a hit piece', owner: 'me' },
    { text: 'Ask two subscribers for a written testimonial with their real name', owner: 'you' },
  ] },
  { week: 8, month: 2, theme: 'Month 2 review', tasks: [
    { text: 'Check Perplexity for a JobUp citation. Record the exact query and result', owner: 'you' },
    { text: 'Review paid subscribers vs month 1. Growing, flat, or churning?', owner: 'you' },
  ] },

  { week: 9, month: 3, theme: 'Chambers and associations', tasks: [
    { text: 'Pitch one Chamber of Commerce: free year for members recently laid off', owner: 'you' },
    { text: 'Prepare a one-page partner sheet', owner: 'me' },
  ] },
  { week: 10, month: 3, theme: 'The subscriber directory pays off', tasks: [
    { text: 'Check how many subscriber sites are indexed in Google. That number is your compounding asset', owner: 'you' },
    { text: 'Fix anything blocking indexation', owner: 'me' },
  ] },
  { week: 11, month: 3, theme: 'Newsletter sponsorship test', tasks: [
    { text: 'Only if conversion is proven: sponsor ONE job-search newsletter, 200 to 500 dollars', owner: 'you' },
    { text: 'Track it with a distinct landing path so you know exactly what it bought', owner: 'me' },
  ] },
  { week: 12, month: 3, theme: 'Quarter review', tasks: [
    { text: 'Honest quarter review: cost per subscriber, churn, which channel actually produced payers', owner: 'you' },
    { text: 'Kill the channels that produced nothing. Do not keep them out of sunk cost', owner: 'you' },
  ] },

  { week: 13, month: 4, theme: 'Double the winner', tasks: [
    { text: 'Identify the single channel that produced the most payers and put most of your hours there', owner: 'you' },
    { text: 'Publish article 5', owner: 'me' },
  ] },
  { week: 14, month: 4, theme: 'Case studies', tasks: [
    { text: 'Write one real subscriber story with their permission and their name', owner: 'you' },
    { text: 'Publish it with schema markup so AI engines can quote it', owner: 'me' },
  ] },
  { week: 15, month: 4, theme: 'Reddit AMA', tasks: [
    { text: 'Only after 60+ non-promotional contributions: ask a mod about an AMA', owner: 'you' },
  ] },
  { week: 16, month: 4, theme: 'Month 4 review', tasks: [
    { text: 'Re-check AI citations across Perplexity, Google AI Overviews and ChatGPT', owner: 'you' },
  ] },

  { week: 17, month: 5, theme: 'Scale what works', tasks: [
    { text: 'Publish two articles this month instead of one', owner: 'me' },
    { text: 'Ask every satisfied subscriber for a review on the directory that sends the most traffic', owner: 'you' },
  ] },
  { week: 18, month: 5, theme: 'Partnerships', tasks: [
    { text: 'Approach two career coaches about referring clients for a cut', owner: 'you' },
  ] },
  { week: 19, month: 5, theme: 'Press', tasks: [
    { text: 'Pitch one local business journal on the Philippines-to-Americas angle', owner: 'you' },
  ] },
  { week: 20, month: 5, theme: 'Month 5 review', tasks: [
    { text: 'Review pricing against actual usage and churn', owner: 'you' },
  ] },

  { week: 21, month: 6, theme: 'Compound', tasks: [
    { text: 'Audit every page for the three GEO levers: statistics, cited sources, direct quotes', owner: 'me' },
  ] },
  { week: 22, month: 6, theme: 'Community', tasks: [
    { text: 'Start a small subscriber community and let them talk to each other', owner: 'you' },
  ] },
  { week: 23, month: 6, theme: 'Second Product Hunt moment', tasks: [
    { text: 'Launch the biggest feature you shipped since month 1 as its own moment', owner: 'you' },
  ] },
  { week: 24, month: 6, theme: 'The honest six-month verdict', tasks: [
    { text: 'Total paid subscribers, revenue, churn, and cost per acquisition', owner: 'you' },
    { text: 'Decide: double down, change the wedge, or stop. All three are legitimate answers', owner: 'you' },
  ] },
];

const PHASES = [
  { id: 0, title: 'Prove the funnel', window: 'Days 1-7',
    why: 'You have subscribers and no collected revenue. Driving traffic into a funnel nobody has completed '
       + 'spends first attention on a diagnosis ten people could give you for free. This phase blocks the rest.' },
  { id: 1, title: 'Free surface area', window: 'Days 8-14',
    why: 'Directory listings and your own subscriber sites are what AI engines and search actually retrieve. '
       + 'Permanent, free, and they compound while you sleep.' },
  { id: 2, title: 'Earn the right to talk', window: 'Days 15-21',
    why: 'Reddit is the most-cited source across AI engines and the fastest place to get banned. '
       + 'Nine useful contributions before one promotional one, and disclose that it is yours.' },
  { id: 3, title: 'Content substrate', window: 'Days 22-28',
    why: 'A Princeton and Georgia Tech study measured up to 40 percent AI-visibility lift from three things: '
       + 'statistics, cited sources and direct quotations. Every page uses all three.' },
  { id: 4, title: 'Compound', window: 'Months 2-6',
    why: 'Weekly themes on top of daily habits. This is the phase where the subscriber-site directory, '
       + 'the content and the referral loop start producing without you pushing.' },
];

/** Stable ids so progress survives an edit to the wording of a task. */
function build() {
  const tasks = [];
  for (const d of DAYS) {
    d.tasks.forEach((t, i) => tasks.push({
      id: `d${d.day}-${i + 1}`, kind: 'day', day: d.day, phase: d.phase,
      week: Math.ceil(d.day / 7), month: 1, ...t,
    }));
  }
  for (const w of WEEKS) {
    w.tasks.forEach((t, i) => tasks.push({
      id: `w${w.week}-${i + 1}`, kind: 'week', week: w.week, month: w.month,
      phase: 4, theme: w.theme, minutes: null, ...t,
    }));
  }
  return tasks;
}

const TASKS = build();

/** What the plan can and cannot promise, stated on the dashboard itself. */
const PROMISE = {
  can: 'Six months from now you will know whether this works, and why — instead of wondering.',
  cannot: 'Virality. That is an outcome of a product people want meeting distribution, and no plan can '
        + 'guarantee it. What this removes is the excuse of not knowing what to do today.',
  gate: 'Phase 0 is deliberately blocking. If nobody pays in week one, the problem is the product or the '
      + 'price, and marketing would only buy you a more expensive version of the same answer.',
};

module.exports = { TASKS, PHASES, HABITS, DAYS, WEEKS, PROMISE };
