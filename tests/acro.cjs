const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch(); const p=await (await br.newContext()).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.goto(URL+'#acrostico'); await p.waitForFunction(()=>/\d/.test(document.querySelector('#view-acrostico .pid').textContent),null,{timeout:20000});
  await p.click('#view-acrostico .gatecard button');
  const btn=await p.$eval('#hintBtn',b=>b.textContent), n=+btn.match(/quedan (\d+)/)[1];
  ok(n>=2 && n<=8,'ayudas según la frase: '+btn);
  for(let i=0;i<n;i++) await p.click('#hintBtn');
  ok(await p.$eval('#hintBtn',b=>b.disabled) && /todas las letras/.test(await p.$eval('#current',e=>e.textContent)),'se agotan: '+await p.$eval('#current',e=>e.textContent));
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
