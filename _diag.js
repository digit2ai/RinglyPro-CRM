const puppeteer=require('puppeteer');
const B='https://aiagent.ringlypro.com/speakup';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({headless:'new',
    executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=/tmp/jfk.wav%noloop']});
  const page=await browser.newPage();
  await page.goto(B+'/login',{waitUntil:'networkidle2'});
  await page.type('#email','mstagg@digit2ai.com'); await page.type('#password','Palindrome@7');
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}), page.click('#btn')]);
  await page.waitForSelector('#orb',{timeout:15000});
  // confirm deployed transcribeBlob has NO forced language
  const hasLang=await page.evaluate(()=> typeof transcribeBlob!=='undefined' ? /language:/.test(transcribeBlob.toString()) : 'undef');
  console.log('deployed transcribeBlob forces language?', hasLang, '(false = new code)');
  const model=await page.evaluate(()=> typeof WHISPER_MODEL!=='undefined'?WHISPER_MODEL:'undef');
  console.log('model:', model);

  await page.click('#orb'); await sleep(13000); await page.click('#orb');
  let raw='';
  for(let i=0;i<45;i++){ await sleep(4000);
    raw=await page.evaluate(()=>{ if(typeof current!=='undefined'&&current&&current.transcript) return current.transcript.text||''; const d=document.getElementById('detail'); return d?d.innerText:''; });
    const st=await page.evaluate(()=>document.getElementById('recstatus')?document.getElementById('recstatus').textContent:'');
    if(raw && raw.length>5 && !/Cargando|loading/i.test(raw)){ break; }
  }
  console.log('RAW TRANSCRIPT:', JSON.stringify(raw).slice(0,400));
  const rid=await page.evaluate(()=>typeof current!=='undefined'&&current.recording?current.recording.id:null);
  if(rid) await page.evaluate(async(id)=>{await fetch('/speakup/api/v1/recordings/'+id,{method:'DELETE'});},rid);
  console.log('cleaned #'+rid);
  await browser.close();
})();
