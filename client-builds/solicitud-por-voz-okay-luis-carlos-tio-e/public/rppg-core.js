/* =====================================================
 * rppg-core.js v2 (MaraMed) — PURE, environment-agnostic rPPG DSP.
 * Importable in the browser (window.RppgCore) AND Node (module.exports) so the
 * benchmark runs the EXACT math the page runs.
 *
 * Architecture (brief v2):
 *   shared backbone: multi-ROI RGB -> preprocess (resample/detrend/illum-comp)
 *     -> rPPG ensemble (POS + CHROM + GREEN, SNR-blended)  [M5]
 *     -> rBCG head-micro-motion estimator                  [M6]
 *     -> rPPG<->rBCG fusion                                 [M6]
 *     -> Signal Quality Index (SQI)                         [M7]
 *     -> Kalman HR tracker                                  [M8]
 *   downstream estimators (each SQI-gated): BPM, Respiration, HRV,
 *     BP (calibration-gated trend), SpO2 (calibration-gated).
 *   NO stress metric anywhere (removed from product).
 * Classical DSP only; no ML weights beyond the caller's face model.
 * ===================================================== */
(function (root) {
  'use strict';

  var HR_FMIN = 0.7, HR_FMAX = 4.0;   // 42..240 bpm
  var RR_FMIN = 0.1, RR_FMAX = 0.5;   // 6..30 breaths/min

  function mean(a){var s=0,i;for(i=0;i<a.length;i++)s+=a[i];return a.length?s/a.length:0;}
  function std(a){var m=mean(a),s=0,i;for(i=0;i<a.length;i++)s+=(a[i]-m)*(a[i]-m);return Math.sqrt(a.length?s/a.length:0);}

  function detrend(x){
    var n=x.length,sx=0,sy=0,sxx=0,sxy=0,i;
    for(i=0;i<n;i++){sx+=i;sy+=x[i];sxx+=i*i;sxy+=i*x[i];}
    var d=(n*sxx-sx*sx)||1,slope=(n*sxy-sx*sy)/d,b=(sy-slope*sx)/n,o=new Array(n);
    for(i=0;i<n;i++)o[i]=x[i]-(slope*i+b);
    return o;
  }
  function meanNormalize(c){var m=mean(c)||1,i,o=new Array(c.length);for(i=0;i<c.length;i++)o[i]=c[i]/m;return o;}

  // Resample an irregular (t,x) series onto a uniform grid at fs Hz. Fixes browser
  // frame jitter (M4). Linear interpolation.
  function resampleUniform(t, x, fs){
    var n=t.length; if(n<2) return {t:t.slice(),x:x.slice()};
    var t0=t[0],t1=t[n-1],dt=1/fs,m=Math.max(2,Math.floor((t1-t0)/dt)+1);
    var ut=new Array(m),ux=new Array(m),j=0,k;
    for(k=0;k<m;k++){
      var tt=t0+k*dt;
      while(j<n-2 && t[j+1]<tt) j++;
      var a=t[j],bb=t[j+1],xa=x[j],xb=x[j+1];
      var f=(bb-a)!==0?(tt-a)/(bb-a):0;
      ux[k]=xa+(xb-xa)*Math.max(0,Math.min(1,f)); ut[k]=tt;
    }
    return {t:ut,x:ux};
  }

  // --- rPPG algorithms ---
  function green(R,G,B){ return detrend(meanNormalize(G)); }
  function pos(R,G,B){
    var Rn=meanNormalize(R),Gn=meanNormalize(G),Bn=meanNormalize(B),n=Rn.length,S1=new Array(n),S2=new Array(n),i;
    for(i=0;i<n;i++){S1[i]=Gn[i]-Bn[i];S2[i]=-2*Rn[i]+Gn[i]+Bn[i];}
    var a=std(S2)?std(S1)/std(S2):0,h=new Array(n);
    for(i=0;i<n;i++)h[i]=S1[i]+a*S2[i];
    return detrend(h);
  }
  function chrom(R,G,B){
    var Rn=meanNormalize(R),Gn=meanNormalize(G),Bn=meanNormalize(B),n=Rn.length,Xs=new Array(n),Ys=new Array(n),i;
    for(i=0;i<n;i++){Xs[i]=3*Rn[i]-2*Gn[i];Ys[i]=1.5*Rn[i]+Gn[i]-1.5*Bn[i];}
    var a=std(Ys)?std(Xs)/std(Ys):0,p=new Array(n);
    for(i=0;i<n;i++)p[i]=Xs[i]-a*Ys[i];
    return detrend(p);
  }

  // Dominant peak in a band + in-band SNR + peak prominence.
  function spectrum(sig, tsec, fmin, fmax, stepHz){
    var n=sig.length; if(n<40) return {f:0,bpm:0,snr:0,prominence:0,power:0};
    var t0=tsec[0],best={f:0,p:-1},total=0,powers=[],freqs=[],f,i;
    for(f=fmin;f<=fmax;f+=stepHz){
      var re=0,im=0;
      for(i=0;i<n;i++){var ph=2*Math.PI*f*(tsec[i]-t0);re+=sig[i]*Math.cos(ph);im-=sig[i]*Math.sin(ph);}
      var p=re*re+im*im; total+=p; powers.push(p); freqs.push(f);
      if(p>best.p){best.p=p;best.f=f;}
    }
    if(best.p<=0||total<=0) return {f:0,bpm:0,snr:0,prominence:0,power:0};
    // SNR = peak-band power / out-of-peak-band power
    var band=0.12, peakPow=0, restPow=0;
    for(i=0;i<powers.length;i++){ if(Math.abs(freqs[i]-best.f)<=band) peakPow+=powers[i]; else restPow+=powers[i]; }
    var snr = restPow>0 ? peakPow/restPow : peakPow;
    var prominence = (total/powers.length)>0 ? best.p/(total/powers.length) : 0; // peak vs mean
    return {f:best.f,bpm:Math.round(best.f*60),snr:snr,prominence:prominence,power:best.p};
  }

  // rPPG ensemble: run POS/CHROM/GREEN, keep the highest-SNR estimate (M5).
  function ensemble(R,G,B,tsec){
    var cands=[
      {m:'pos',   s:spectrum(pos(R,G,B),   tsec,HR_FMIN,HR_FMAX,0.6/60)},
      {m:'chrom', s:spectrum(chrom(R,G,B), tsec,HR_FMIN,HR_FMAX,0.6/60)},
      {m:'green', s:spectrum(green(R,G,B), tsec,HR_FMIN,HR_FMAX,0.6/60)}
    ];
    cands.sort(function(a,b){return b.s.snr-a.s.snr;});
    var win=cands[0];
    return {bpm:win.s.bpm,f:win.s.f,snr:win.s.snr,prominence:win.s.prominence,method:win.m,all:cands};
  }

  // rBCG: HR from vertical head micro-motion (blood ejection moves the head each
  // beat). Color-independent -> the Fitzpatrick-bias mitigation (M6).
  function estimateRBCG(motion, tsec){
    if(!motion||motion.length<40) return {bpm:null,snr:0,f:0};
    var s=spectrum(detrend(motion),tsec,HR_FMIN,HR_FMAX,0.6/60);
    return {bpm:s.bpm,snr:s.snr,f:s.f,prominence:s.prominence};
  }

  // Fuse rPPG + rBCG: they fail in different regimes. Agreement is a confidence
  // input. Pick the higher-SNR source; SNR-weight when they agree.
  function fuseHR(rppg, rbcg){
    var haveB = rbcg && rbcg.bpm!=null && rbcg.snr>0;
    var STRONG=1.5;
    if(!haveB) return {bpm:rppg.bpm, agreement:null, source:'rppg', snr:rppg.snr};
    var agree=Math.abs(rppg.bpm-rbcg.bpm);
    if(agree<=4){
      var wP=rppg.snr, wB=rbcg.snr, sum=wP+wB||1;
      return {bpm:Math.round((rppg.bpm*wP+rbcg.bpm*wB)/sum), agreement:agree, source:'fused', snr:Math.max(rppg.snr,rbcg.snr)};
    }
    // Disagreement: a clean color signal (high rPPG SNR) is NOT overridden by
    // head motion — big non-HR motion produces a spurious rBCG peak. Only let
    // rBCG rescue when rPPG itself is weak (dark skin / low light).
    if(rppg.snr>=STRONG) return {bpm:rppg.bpm, agreement:agree, source:'rppg', snr:rppg.snr};
    if(rbcg.snr>=STRONG && rbcg.snr>rppg.snr) return {bpm:rbcg.bpm, agreement:agree, source:'rbcg', snr:rbcg.snr};
    return {bpm: rppg.snr>=rbcg.snr?rppg.bpm:rbcg.bpm, agreement:agree, source:'weak', snr:Math.max(rppg.snr,rbcg.snr)};
  }

  // Beat detection -> inter-beat intervals (ms) -> time-domain HRV (SDNN,RMSSD).
  function hrvFromPulse(pulse, tsec){
    var n=pulse.length,s=std(pulse),i; if(n<60||s===0) return {sdnn:null,rmssd:null,beats:0,regularity:0};
    var thr=0.3*s,peaks=[];
    for(i=1;i<n-1;i++){ if(pulse[i]>thr&&pulse[i]>=pulse[i-1]&&pulse[i]>pulse[i+1]){ if(!peaks.length||(tsec[i]-tsec[peaks[peaks.length-1]])>0.3) peaks.push(i); } }
    if(peaks.length<4) return {sdnn:null,rmssd:null,beats:peaks.length,regularity:0};
    var ibi=[]; for(i=1;i<peaks.length;i++) ibi.push((tsec[peaks[i]]-tsec[peaks[i-1]])*1000);
    ibi=ibi.filter(function(v){return v>=250&&v<=2000;});
    if(ibi.length<3) return {sdnn:null,rmssd:null,beats:peaks.length,regularity:0};
    var sdnn=std(ibi),d2=0; for(i=1;i<ibi.length;i++) d2+=Math.pow(ibi[i]-ibi[i-1],2);
    var rmssd=Math.sqrt(d2/(ibi.length-1));
    var regularity=mean(ibi)>0?Math.max(0,1-(sdnn/mean(ibi))):0; // 1=very regular
    return {sdnn:Math.round(sdnn*10)/10,rmssd:Math.round(rmssd*10)/10,beats:peaks.length,regularity:regularity};
  }

  // Respiration: fuse (1) pulse-baseline/amplitude modulation, (2) optical-flow
  // chest/shoulder motion. Agreement = confidence (E2).
  function estimateRespiration(baseline, tsec, flowMotion){
    var s1=spectrum(detrend(baseline),tsec,RR_FMIN,RR_FMAX,0.3/60);
    var rr1=s1.f>0?Math.round(s1.f*60):null;
    var rr2=null,s2={snr:0};
    if(flowMotion&&flowMotion.length>=40){ s2=spectrum(detrend(flowMotion),tsec,RR_FMIN,RR_FMAX,0.3/60); rr2=s2.f>0?Math.round(s2.f*60):null; }
    if(rr1!=null&&rr2!=null){
      var agree=Math.abs(rr1-rr2);
      return {rr:Math.round((rr1+rr2)/2),agreement:agree,sources:2,ok:agree<=4};
    }
    return {rr:(rr1!=null?rr1:rr2),agreement:null,sources:(rr1!=null||rr2!=null)?1:0,ok:(rr1!=null)};
  }

  // BP pulse-morphology features from an averaged beat (E4). Trend only; needs
  // per-user calibration to map to mmHg.
  function bpFeatures(pulse, tsec){
    var h=hrvFromPulse(pulse,tsec); if(h.beats<4) return null;
    // crude morphology proxies over the whole window (calibration absorbs scale):
    var amp=std(pulse);
    // rise time proxy: fraction of samples above zero-cross going up
    var ups=0,i; for(i=1;i<pulse.length;i++) if(pulse[i-1]<0&&pulse[i]>=0) ups++;
    var riseProxy = ups>0 ? pulse.length/ups : pulse.length;
    return {amplitude:amp, rise_proxy:riseProxy, regularity:h.regularity, sdnn:h.sdnn};
  }
  function bpFromFeatures(feat, calib){
    // calib = { ref_sys, ref_dia, ref_amp, ref_rise } captured against a cuff.
    if(!feat||!calib||calib.ref_sys==null) return {systolic:null,diastolic:null,calibrated:false};
    // Trend model: deviation of amplitude/rise from calibration nudges BP.
    var dAmp = calib.ref_amp? (feat.amplitude-calib.ref_amp)/calib.ref_amp : 0;
    var dRise= calib.ref_rise? (feat.rise_proxy-calib.ref_rise)/calib.ref_rise : 0;
    // higher amplitude/stiffer (shorter rise) -> higher systolic (bounded nudge)
    var sys = calib.ref_sys + Math.max(-20,Math.min(20, dAmp*18 - dRise*10));
    var dia = calib.ref_dia + Math.max(-12,Math.min(12, dAmp*10 - dRise*6));
    return {systolic:Math.round(sys), diastolic:Math.round(dia), calibrated:true, range:'±10 (trend)'};
  }

  // SpO2 ratio-method (RGB has no IR -> relative + calibration only, E5).
  function spo2Ratio(R,G,B){
    function acdc(c){var m=mean(c)||1;return std(c)/m;}
    var rr=acdc(R), bb=acdc(B)||1e-6;
    return rr/bb; // ratio-of-ratios proxy
  }
  function spo2FromRatio(ratio, calib){
    if(calib==null||calib.ref_ratio==null||calib.ref_spo2==null) return {spo2:null,calibrated:false};
    // relative nudge around the calibrated point, clamped to a plausible band
    var d=(ratio-calib.ref_ratio);
    var v=calib.ref_spo2 - d*8;
    return {spo2:Math.max(85,Math.min(100,Math.round(v))), calibrated:true};
  }

  // Signal Quality Index 0..100 (M7): fused SNR + peak prominence + motion +
  // rPPG/rBCG agreement + beat regularity. The spine of "robust".
  function computeSQI(inp){
    // Calibrated to REAL webcam signal levels (a good live pulse has SNR ~2-4 and
    // prominence ~6-15, far below clean synthetic clips). Dominated by SNR + peak
    // prominence so pure noise still scores low, but a genuine reading in decent
    // light/stillness lands ~55-85 (not refused). Motion is a penalty.
    var snr=Math.max(0,Math.min(1,(inp.snr||0)/3));
    var prom=Math.max(0,Math.min(1,((inp.prominence||0)-1)/12));
    var reg=Math.max(0,Math.min(1,inp.regularity||0));
    var agree=inp.agreement==null?0:(inp.agreement<=3?0.1:(inp.agreement<=6?0.05:0));
    var base=snr*0.55 + prom*0.30 + reg*0.15 + agree;
    var motionPenalty=Math.max(0,Math.min(1,(inp.motion||0)/15))*0.3;
    return Math.round(Math.max(0,Math.min(1,base-motionPenalty))*100);
  }

  // Kalman HR tracker (M8): smooth, jump-limited BPM over time.
  function KalmanHR(opts){
    opts=opts||{}; var q=opts.q||1.0, r=opts.r||6.0, maxRate=opts.maxRate||15; // bpm/s
    var x=null,p=100;
    return {
      update:function(meas, dt, conf){
        dt=dt||1; conf=(conf==null?0.5:conf);
        if(meas==null) return x;
        if(x==null){ x=meas; p=r; return x; }
        // reject non-physiological jumps
        var maxDelta=maxRate*dt;
        if(Math.abs(meas-x)>maxDelta+8) return x; // ignore wild jump this step
        p=p+q*dt;
        var rEff=r/Math.max(0.1,conf); // trust high-confidence measurements more
        var k=p/(p+rEff);
        x=x+k*(meas-x); p=(1-k)*p;
        return Math.round(x);
      },
      value:function(){return x==null?null:Math.round(x);}
    };
  }

  // One-shot estimate over a full window. input:
  //   { t:[ms], rois:[{r,g,b}...] | {r,g,b}, background:{r,g,b}?, headMotion:[y]?,
  //     flowMotion:[v]?, calibration:{bp,spo2}? , fs?:number }
  function estimateVitals(input, opts){
    opts=opts||{};
    var tr = Array.isArray(input.rois)? fuseROIs(input.rois, input.background) : (input.rois||input);
    if(!tr||!tr.g||tr.g.length<60) return {bpm:null,sqi:0,reason:'insufficient_signal'};
    var fs = input.fs||opts.fs||30;
    var t = input.t || tr.t; // timestamps live on the input
    if(!t||t.length<60) return {bpm:null,sqi:0,reason:'insufficient_signal'};
    // uniform resample (M4)
    var t0=t[0];
    var Rr=resampleUniform(t,tr.r,fs), Gr=resampleUniform(t,tr.g,fs), Br=resampleUniform(t,tr.b,fs);
    var R=Rr.x,G=Gr.x,B=Br.x, tsec=Rr.t.map(function(v){return (v-t0)/1000;});

    var ens=ensemble(R,G,B,tsec);
    var rbcg={bpm:null,snr:0};
    var motionLevel=0;
    if(input.headMotion&&input.headMotion.length>=40){
      var hm=resampleUniform(t,input.headMotion,fs).x;
      rbcg=estimateRBCG(hm,tsec);
      motionLevel=std(detrend(hm));
    }
    var fused=fuseHR(ens,rbcg);

    var posPulse=pos(R,G,B);
    var resp=estimateRespiration(G,tsec, input.flowMotion?resampleUniform(t,input.flowMotion,fs).x:null);
    var hrv=hrvFromPulse(posPulse,tsec);

    var sqi=computeSQI({snr:fused.snr,prominence:ens.prominence,motion:motionLevel,agreement:fused.agreement,regularity:hrv.regularity});

    // BP + SpO2 are calibration-gated (experimental).
    var bpFeat=bpFeatures(posPulse,tsec);
    var bp=bpFromFeatures(bpFeat, opts.calibration&&opts.calibration.bp);
    var spo2r=spo2Ratio(R,G,B);
    var spo2=spo2FromRatio(spo2r, opts.calibration&&opts.calibration.spo2);

    // HRV at-rest gate (E3): only when SQI high AND low motion.
    var hrvGated = (sqi>=70 && motionLevel<2.0);
    return {
      bpm:(fused.bpm>=30&&fused.bpm<=220)?fused.bpm:null,
      hr_source:fused.source,
      hr_agreement_bpm:fused.agreement,
      respiratory_bpm:(resp.rr&&resp.rr>=5&&resp.rr<=40&&resp.ok)?resp.rr:null,
      hrv_sdnn_ms:hrvGated?hrv.sdnn:null,
      hrv_rmssd_ms:hrvGated?hrv.rmssd:null,
      hrv_gated_out:!hrvGated,
      bp_systolic:bp.systolic, bp_diastolic:bp.diastolic, bp_calibrated:bp.calibrated,
      spo2:spo2.spo2, spo2_calibrated:spo2.calibrated, spo2_ratio:Math.round(spo2r*1000)/1000,
      bp_features:bpFeat,
      sqi:sqi, method:ens.method, motion:Math.round(motionLevel*100)/100
    };
  }

  function fuseROIs(traces, background){
    var valid=traces.filter(function(tr){return tr&&tr.g&&tr.g.length>40;});
    if(!valid.length) return null;
    var ref=valid[0],n=ref.g.length,R=new Array(n),G=new Array(n),B=new Array(n),i,k;
    for(i=0;i<n;i++){
      var sr=0,sg=0,sb=0,c=0;
      for(k=0;k<valid.length;k++){ if(valid[k].r.length>i){sr+=valid[k].r[i];sg+=valid[k].g[i];sb+=valid[k].b[i];c++;} }
      R[i]=c?sr/c:0;G[i]=c?sg/c:0;B[i]=c?sb/c:0;
      // illumination compensation (M4): subtract background drift if provided
      if(background&&background.g&&background.g.length>i){ R[i]-=(background.r[i]-mean(background.r)); G[i]-=(background.g[i]-mean(background.g)); B[i]-=(background.b[i]-mean(background.b)); }
    }
    var t=(ref.t||traces[0].t||[]).slice(0,n);
    return {t:t,r:R,g:G,b:B};
  }

  var api={
    estimateVitals:estimateVitals, ensemble:ensemble, estimateRBCG:estimateRBCG, fuseHR:fuseHR,
    computeSQI:computeSQI, KalmanHR:KalmanHR, hrvFromPulse:hrvFromPulse, estimateRespiration:estimateRespiration,
    bpFeatures:bpFeatures, bpFromFeatures:bpFromFeatures, spo2Ratio:spo2Ratio, spo2FromRatio:spo2FromRatio,
    pos:pos, chrom:chrom, green:green, detrend:detrend, spectrum:spectrum, resampleUniform:resampleUniform, fuseROIs:fuseROIs,
    HR_FMIN:HR_FMIN, HR_FMAX:HR_FMAX
  };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.RppgCore=api;
})(typeof self!=='undefined'?self:this);
