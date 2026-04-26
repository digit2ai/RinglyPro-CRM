#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - Mature, Reassuring, Confident (American)
const MODEL_ID = 'eleven_multilingual_v2';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'chamber', 'virtualchamber', 'assets', 'audio');

const slides = [
  { file: 'virtualchamber-01.mp3', text: 'VirtualChamber dot app. Digital Ecosystem. The B2B engine with Neural Intelligence AI for Chambers of Commerce. Powered by Digit2AI.' },
  { file: 'virtualchamber-02.mp3', text: 'A Connected Global World. Every Chamber, Every Region. One Platform. VirtualChamber dot app is built to connect entrepreneurs and chambers of commerce worldwide. From New York to London, from Singapore to Sao Paulo, members grow together on a single AI-powered digital platform.' },
  { file: 'virtualchamber-03.mp3', text: 'Connections exist. Infrastructure does not. Zero percent outcome tracking. Manual introductions. Membership ROI impossible to prove. Spreadsheet directories. No outcome tracking. The relationships are real. The tools are not.' },
  { file: 'virtualchamber-04.mp3', text: 'The Solution. One platform. Nine modules. Twenty-four sectors. Six regions. Always on. VirtualChamber dot app is the digital backbone that connects every entrepreneur, professional, and business worldwide.' },
  { file: 'virtualchamber-05.mp3', text: 'Six modules to unlock. Six core modules that power the VirtualChamber dot app Digital Ecosystem. Dashboard, AI Matching, Projects, Business Exchange, Network Analytics, and the MCP Orchestrator. Let us unlock them one by one.' },
  { file: 'virtualchamber-07.mp3', text: 'Module One. Member Dashboard. Your command center. Know the state of your network at a glance. No spreadsheets, no guesswork, no waiting for quarterly reports. Real-time active member count, live project pipeline, RFQ activity, and the HCI Health Index measuring the overall vitality of your chamber.' },
  { file: 'virtualchamber-09.mp3', text: 'Module Two. AI Business Matching. I need a logistics partner in Texas to export to Europe. The AI finds the best match in seconds, ranked by trust scores and sector fit. Cosine Similarity measures how closely aligned two profiles are. Gini Fairness Correction ensures equitable opportunity distribution. And Trust Scores deliver reliable results based on real history.' },
  { file: 'virtualchamber-11.mp3', text: 'Module Three. Project Collaboration. Six lifecycle phases. Data-driven viability. Cross-regional teams. Proposal, Analysis, Team, Resources, Execution, Completed. Every project runs through ten thousand Monte Carlo iterations before a single dollar is committed. The AI matches skills from anywhere in the world to project needs. Transparent governance. Everyone sees the same data.' },
  { file: 'virtualchamber-13.mp3', text: 'Module Four. Business Exchange. A private marketplace exclusively for VirtualChamber dot app members. Post RFQs, browse the company directory, submit proposals, and manage bids within your trusted network. RFQs and proposals between verified businesses. Searchable, always-current directory. Bid management with scoring criteria. And secure project funding with Stripe Escrow.' },
  { file: 'virtualchamber-15.mp3', text: 'Modules Five and Six. Network Analytics and the MCP Orchestrator. Six technology tools that make the difference. AI Matching Engine. PageRank-inspired TrustRank. Ten thousand iteration Monte Carlo simulation. MCP Orchestrator with seven tools. HCI Composite Index. And Gini Fairness Correction. All powered by Digit2AI Neural Intelligence.' },
  { file: 'virtualchamber-16.mp3', text: 'Your data is yours. Total isolation. No data leakage. No shared analytics. Fourteen private tables prefixed with virtualchamber. Separate JWT authentication. Your tokens, your sessions, your access control, independent from any other chamber. Independent analytics. Your AI models train only on your data. Your insights stay private. No other chamber can see your data.' },
  { file: 'virtualchamber-17.mp3', text: 'Power Level one hundred. All modules activated. The VirtualChamber dot app Digital Ecosystem is fully online. Member Dashboard, AI Matching, Projects, Business Exchange, Network Analytics, and the MCP Orchestrator. Six modules unlocked. Ecosystem fully activated.' },
  { file: 'virtualchamber-18.mp3', text: 'The Plan. Request a Demo. Full access to all nine modules. Configurable subscription tailored to your chamber. AI Business Matching, Member Dashboard, Project Collaboration, Business Exchange, Network Analytics, MCP Orchestrator, TrustRank Scoring, Monte Carlo Simulation, Stripe-secured payments, and a 24/7 AI Voice Assistant.' },
  { file: 'virtualchamber-19.mp3', text: 'Three Steps to Activate Your Account Today. Step one: register at the portal. Create your profile at VirtualChamber dot app. Takes less than three minutes. Step two: complete your profile. Add your sector, skills, location, and what you are looking for. The AI matching engine activates immediately. Step three: run your first AI match. Within minutes, receive your first AI-curated business connection. Visit VirtualChamber dot app and activate the digital ecosystem.' },
  { file: 'virtualchamber-founders.mp3', text: 'We are here to empower your chamber of commerce. Maria Clara Garcia, founder of Visionarium, with over thirty years transforming young people into global leaders. Numeriano Bouffard, founder of the Philippine American Chamber of Commerce of Central Florida, our first pilot chamber, with over three decades connecting entrepreneurs. And Manuel Stagg, CEO of Digit2AI, the company that builds the entire VirtualChamber dot app ecosystem. Talk to us. Visit VirtualChamber dot app. We are on the other side, ready to help your chamber grow.' },
  { file: 'virtualchamber-20.mp3', text: 'VirtualChamber dot app. Your Chamber. Your Data. Your Growth. Powered by Digit2AI. Digital Chamber of Commerce for the Modern World. Thank you.' }
];

async function generateAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true }
    });
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': API_KEY, 'Accept': 'audio/mpeg' }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let body = ''; res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve(Buffer.concat(chunks).length);
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Generating ${slides.length} audio files (Sarah voice)...`);
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const outputPath = path.join(OUTPUT_DIR, s.file);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
      console.log(`[${i+1}/${slides.length}] SKIP ${s.file}`);
      continue;
    }
    try {
      console.log(`[${i+1}/${slides.length}] Generating ${s.file}...`);
      const size = await generateAudio(s.text, outputPath);
      console.log(`  OK - ${(size/1024).toFixed(0)}KB`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  FAIL - ${err.message}`);
    }
  }
  console.log('Done!');
})();
