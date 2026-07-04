// =====================================================
// bench-rppg.js v3 (MaraMed) — runs the EXACT browser DSP (rppg-core.js) against
// committed RGB-trace fixtures + synthetic scenarios, and gates numerically:
//   G1 HR MAE on CSV fixtures <= 5 bpm
//   G2 rBCG fusion rescues a dark-skin/low-signal clip (fused err < rPPG-only err)
//   G3 fusion does NOT degrade on a high-motion clip (fused err <= rPPG-only err)
//   G4 refusal: pure noise yields SQI < 35
// This is a reproducible engineering benchmark, NOT clinical validation. Real
// Fitzpatrick I-VI validation needs the consented dataset (brief Section 11).
//   run: node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/scripts/bench-rppg.js
// Exits 0 only when every gate passes.
// =====================================================

const fs = require('fs');
const path = require('path');
const C = require('../public/rppg-core');

const BOUND_BPM = 5.0;
const FIX_DIR = path.join(__dirname, '..', 'fixtures');

// deterministic PRNG (no Math.random -> reproducible commits)
let _seed = 20260704;
function rnd(){ _seed=(_seed*1103515245+12345)&0x7fffffff; return _seed/0x7fffffff-0.5; }
function nz(i){ return 0.6*Math.sin(2*Math.PI*0.37*i/30+1.1)+0.4*Math.sin(2*Math.PI*1.9*i/30+0.3); }
function clip(hr,ampScale,motionAtHR,motionNoise,rr,colorNoise){
  const N=900,fps=30,f=hr/60,fr=(rr||15)/60,t=[],r=[],g=[],b=[],hm=[];
  for(let i=0;i<N;i++){const s=i/fps,p=Math.sin(2*Math.PI*f*s),resp=Math.sin(2*Math.PI*fr*s);
    t.push(Math.round(s*1000)); const cn=(colorNoise||0)*rnd();
    g.push(128-6*ampScale*p+0.8*resp+0.5*nz(i)+cn); r.push(140-2.2*ampScale*p+0.6*resp+0.5*nz(i)+cn); b.push(118-1.6*ampScale*p+0.5*resp+0.5*nz(i)+cn);
    hm.push(motionAtHR*Math.sin(2*Math.PI*f*s+0.5)+motionNoise*rnd());
  }
  return {t,rois:{r,g,b},headMotion:hm,fs:30};
}

function parseCsv(txt){
  const lines=txt.trim().split(/\r?\n/).filter(l=>l&&!/^t_ms/i.test(l));
  const t=[],r=[],g=[],b=[];
  for(const ln of lines){const p=ln.split(',');if(p.length<4)continue;t.push(+p[0]);r.push(+p[1]);g.push(+p[2]);b.push(+p[3]);}
  return {t,r,g,b};
}

const gates=[];
function gate(name,pass,detail){gates.push({name,pass:!!pass,detail:detail||''});}

// G1 — CSV fixtures HR MAE
const csvRows=[]; let absSum=0,n=0;
if(fs.existsSync(FIX_DIR)){
  for(const f of fs.readdirSync(FIX_DIR).filter(x=>x.endsWith('.csv'))){
    const m=f.match(/_gt(\d+)/); if(!m) continue;
    const gt=+m[1], tr=parseCsv(fs.readFileSync(path.join(FIX_DIR,f),'utf8'));
    const est=C.estimateVitals({t:tr.t,rois:{r:tr.r,g:tr.g,b:tr.b},fs:30});
    const err=est.bpm==null?NaN:Math.abs(est.bpm-gt);
    if(Number.isFinite(err)){absSum+=err;n++;}
    csvRows.push({f,gt,got:est.bpm==null?'null':est.bpm,rr:est.respiratory_bpm,sqi:est.sqi,err:Number.isFinite(err)?err.toFixed(1):'n/a'});
  }
}
const mae=n?absSum/n:Infinity;
gate('G1 CSV HR MAE <= '+BOUND_BPM+' bpm', mae<=BOUND_BPM, 'MAE='+mae.toFixed(2)+' n='+n);

// G2 — dark-skin/low-signal rescue via rBCG fusion
const dark=clip(66,0,0.6,0,14,6);
const g2rppg=C.estimateVitals({t:dark.t,rois:dark.rois,fs:30}).bpm;
const g2fused=C.estimateVitals(dark).bpm;
const g2errR=g2rppg==null?999:Math.abs(g2rppg-66), g2errF=g2fused==null?999:Math.abs(g2fused-66);
gate('G2 rBCG fusion rescues dark-skin (fused err < rPPG-only)', g2errF<g2errR && g2errF<=4, 'rPPG-only='+g2rppg+' fused='+g2fused+' (gt66)');

// G3 — motion does not degrade fusion below rPPG-only
const mo=clip(84,1,0,4,16,0);
const g3rppg=C.estimateVitals({t:mo.t,rois:mo.rois,fs:30}).bpm;
const g3fused=C.estimateVitals(mo).bpm;
const g3errR=g3rppg==null?999:Math.abs(g3rppg-84), g3errF=g3fused==null?999:Math.abs(g3fused-84);
gate('G3 motion: fused err <= rPPG-only err', g3errF<=g3errR && g3errF<=3, 'rPPG-only='+g3rppg+' fused='+g3fused+' (gt84)');

// G4 — refusal on pure noise
const nn={t:[],rois:{r:[],g:[],b:[]},fs:30};
for(let i=0;i<900;i++){nn.t.push(Math.round(i/30*1000));nn.rois.r.push(140+10*rnd());nn.rois.g.push(128+10*rnd());nn.rois.b.push(118+10*rnd());}
const g4sqi=C.estimateVitals(nn).sqi;
gate('G4 refusal: pure-noise SQI < 35', g4sqi<35, 'SQI='+g4sqi);

// report
console.log('\n## MaraMed rPPG benchmark v3\n');
console.log('| Fixture | GT | Est | RR | SQI | |err| |');
console.log('|---|---|---|---|---|---|');
csvRows.forEach(r=>console.log(`| ${r.f} | ${r.gt} | ${r.got} | ${r.rr==null?'—':r.rr} | ${r.sqi} | ${r.err} |`));
console.log(`\nCSV MAE = ${mae.toFixed(2)} bpm (n=${n}, bound ${BOUND_BPM})\n`);
console.log('| Gate | Result | Detail |');
console.log('|---|---|---|');
gates.forEach(g=>console.log(`| ${g.name} | ${g.pass?'PASS':'FAIL'} | ${g.detail} |`));
const failed=gates.filter(g=>!g.pass);
console.log(`\n**${gates.length-failed.length}/${gates.length} gates passed.**`);
process.exit(failed.length?1:0);
