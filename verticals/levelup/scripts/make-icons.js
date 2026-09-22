// Render the LevelUp mark to the PNG sizes a home screen actually needs.
// Chrome, not sips: sips is unreliable on SVG fills and effects.
const p=require('puppeteer'),fs=require('fs'),path=require('path');
const DIR='/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/verticals/levelup/public';
const svg=fs.readFileSync(path.join(DIR,'icon.svg'),'utf8');
(async()=>{
  const b=await p.launch({args:['--no-sandbox']});
  const pg=await b.newPage();
  for(const n of [180,192,512]){
    await pg.setViewport({width:n,height:n,deviceScaleFactor:1});
    await pg.setContent('<style>html,body{margin:0;padding:0;background:#26213F}svg{display:block;width:'+n+'px;height:'+n+'px}</style>'+svg);
    await pg.screenshot({path:path.join(DIR,'icon-'+n+'.png'),omitBackground:false});
  }
  await b.close();
  for(const n of [180,192,512]) console.log('icon-'+n+'.png', fs.statSync(path.join(DIR,'icon-'+n+'.png')).size+'B');
})();
