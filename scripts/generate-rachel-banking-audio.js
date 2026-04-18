#!/usr/bin/env node
/**
 * Generate Rachel Premium Voice MP3s for Neural Intelligence Banking Presentation
 * Uses ElevenLabs Text-to-Speech API with Rachel voice (21m00Tcm4TlvDq8ikWAM)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const RACHEL_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'neural-intelligence-banking', 'assets', 'audio');

// Narration scripts for each slide -- must match data-narration attributes in presentation.html
const narrations = [
  // Slide 01 -- Title
  `Welcome. I'm Rachel, and today I'll walk you through how Neural Intelligence, powered by the Model Context Protocol, is transforming banking compliance worldwide. This technology addresses the single biggest challenge facing financial institutions today: the compliance crisis that costs over 274 billion dollars annually and generates false positive rates above 95 percent. Let's explore how AI reasoning, connected through a universal open standard, can solve this.`,

  // Slide 02 -- The Problem
  `Here is the core problem. Traditional compliance systems are rule-based. They apply static thresholds. If a transaction exceeds ten thousand dollars, flag it. If a name matches a sanctions list with 80 percent similarity, generate an alert. These rules are rigid. They cannot adapt to evolving criminal methods. And they generate enormous noise. 95 to 99 percent of all alerts are false positives. That means for every real threat detected, the system generates 20 to 99 false alarms. Compliance analysts spend their days clearing noise instead of catching criminals. This is not a technology limitation of the past. This is the reality today at most banks worldwide.`,

  // Slide 03 -- What Is Neural Intelligence
  `Neural Intelligence is fundamentally different. Instead of applying rules to individual data points, it reasons across multiple data sources simultaneously. Think of it this way: a rule-based system is like a calculator. It follows formulas. Neural Intelligence is like hiring a team of expert compliance analysts who can read every document, check every database, apply judgment, and work at the speed of software, 24 hours a day. The key distinction is this: rule-based systems detect known patterns. Neural Intelligence identifies unknown risks by reasoning about context. It combines the customer's transaction history, their KYC profile, sanctions databases, adverse media signals, corporate ownership structures, and geographic risk factors -- all at once, in milliseconds.`,

  // Slide 04 -- What Is MCP
  `Now, how does the AI actually connect to all these data sources? This is where the Model Context Protocol comes in. MCP is an open standard released by Anthropic in 2024. Think of it as USB-C for AI. Before USB-C, every device had a different charger. Similarly, before MCP, every AI-to-database connection required a custom integration. MCP provides one universal protocol that replaces dozens of proprietary connectors. It has been adopted by Claude, ChatGPT, VS Code, and major enterprise platforms. For banking, this means the AI can connect to your core banking system, your sanctions databases, your case management tools, and your regulatory filing systems -- all through one standardized, secure, auditable protocol.`,

  // Slide 05 -- Three-Tier Architecture
  `Let me show you the architecture. MCP follows a three-tier model: Host, Client, and Server. At the top is the Host -- that's your banking compliance application. It controls everything. It creates connections, enforces security policies, and controls what data flows where. In the middle are MCP Clients -- each maintains an isolated, one-to-one connection with a specific server. The sanctions client cannot see the customer data client. This isolation is critical for banking security. At the bottom are MCP Servers -- lightweight programs that wrap your existing banking systems. Your core banking platform, your OFAC database, your case management tool -- each gets a standardized wrapper. No rip-and-replace. You keep your existing infrastructure.`,

  // Slide 06 -- Three Primitives
  `Every MCP Server communicates through three standardized primitives. First: Tools. These are executable functions the AI can invoke. Run a sanctions check. Pull a transaction history. File a SAR. Submit an STR. Each invocation is logged with full parameters for audit. Second: Resources. These are read-only data the server exposes. Customer profiles. Regulatory rule sets. Risk scoring models. The application controls when and how data is accessed. Third: Prompts. These are structured templates that ensure consistent output. SAR narratives in FinCEN format. STR reports for the AMLC. EDD investigation summaries. Every report follows the exact format examiners expect.`,

  // Slide 07 -- Wire Transfer Flow
  `Let me show you a concrete example. A wire transfer arrives for screening. Here is exactly what happens, in milliseconds. Step one: the Transaction MCP Server receives the wire data from the payment rail -- SWIFT, ACH, PIX, SEPA, or InstaPay. Step two: the Sanctions MCP Server simultaneously checks the originator and beneficiary against OFAC, UN, EU, AMLC, and UK OFSI lists -- using AI entity resolution, not just string matching. Step three: the Core Banking and KYC servers provide the customer profile, risk rating, transaction baseline, and CDD status. Step four: the Neural Intelligence engine reasons across ALL this data. Is this transaction consistent with the customer's profile? Their peer group? Known typologies? Step five: the system renders a decision -- clear, alert, or block -- with a full reasoning chain logged for examiners. If an alert is generated, the Case Management server creates an investigation automatically.`,

  // Slide 08 -- Security
  `Security is not an afterthought. It is built into the protocol itself. MCP mandates OAuth 2.1 with PKCE for all connections. Tokens are scoped per server using Resource Indicators, RFC 8707. This means a token issued for the sanctions server literally cannot be used to access the customer data server. Data isolation is enforced at the protocol level. Servers cannot read the full conversation. They cannot see into other servers. The only entity that controls cross-server data flow is your Host application. Every single tool invocation -- every sanctions check, every data lookup, every filing action -- is logged with timestamp, user identity, parameters, and results. This immutable audit trail satisfies SOC 2, ISO 27001, the EU AI Act, BSP Circular 1085, and OCC 2011-12 simultaneously.`,

  // Slide 09 -- Results
  `Let's talk results. Banks deploying Neural Intelligence with MCP are seeing 50 to 75 percent reduction in false positives. That is not a theoretical number. HSBC reported approximately 60 percent reduction after deploying AI-based transaction monitoring. For a mid-size bank, this translates to 40 to 60 percent reduction in compliance operating costs within 18 to 24 months. The system automates 70 percent of routine compliance workflows. And the implementation timeline is 90 days to first measurable results -- not 12 to 24 months like legacy enterprise platforms. Each phase runs in shadow mode alongside your existing systems, so there is zero deployment risk.`,

  // Slide 10 -- Closing
  `To summarize: Neural Intelligence with MCP is not incremental improvement. It is a paradigm shift. From rules to reasoning. From proprietary silos to a universal open standard. From 95 percent false positives to intelligent, contextual detection. From fragmented point solutions to a unified platform that satisfies FinCEN, AMLC, CNBV, AMLA, MAS, AUSTRAC, and every major regulator simultaneously. The technology exists. The regulatory framework supports it. The economic case is clear. The question for banking leadership is no longer 'should we?' but 'how soon can we start?' Thank you. I'm Rachel, and this has been a Digit2AI technology briefing.`
];

async function generateAudio(text, slideNum) {
  const paddedNum = String(slideNum).padStart(2, '0');
  const outputPath = path.join(OUTPUT_DIR, `slide-${paddedNum}.mp3`);

  // Skip if already exists
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size > 1000) {
      console.log(`[${paddedNum}] Already exists (${(stats.size/1024).toFixed(0)}KB) -- skipping`);
      return;
    }
  }

  console.log(`[${paddedNum}] Generating Rachel voice (${text.length} chars)...`);

  const postData = JSON.stringify({
    text: text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.65,
      similarity_boost: 0.78,
      style: 0.35,
      use_speaker_boost: true
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${RACHEL_VOICE_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
        'Accept': 'audio/mpeg'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          console.error(`[${paddedNum}] API error ${res.statusCode}: ${body}`);
          reject(new Error(`API error ${res.statusCode}`));
        });
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        const size = fs.statSync(outputPath).size;
        console.log(`[${paddedNum}] Saved (${(size/1024).toFixed(0)}KB)`);
        resolve();
      });
      fileStream.on('error', reject);
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  if (!ELEVENLABS_API_KEY) {
    console.error('ERROR: ELEVENLABS_API_KEY not set in .env');
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nGenerating ${narrations.length} Rachel Premium voice MP3s...\n`);
  console.log(`Voice: Rachel (${RACHEL_VOICE_ID})`);
  console.log(`Model: eleven_multilingual_v2`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  for (let i = 0; i < narrations.length; i++) {
    try {
      await generateAudio(narrations[i], i + 1);
      // Small delay between API calls to respect rate limits
      if (i < narrations.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error(`[${String(i+1).padStart(2,'0')}] FAILED: ${err.message}`);
    }
  }

  console.log('\nDone. All audio files generated.\n');
}

main();
