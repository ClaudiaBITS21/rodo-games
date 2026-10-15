const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  fs.writeFileSync('etag.txt','v1');
  const br=await chromium.launch(); const P=await (await br.newContext()).newPage();
  await P.goto('http://localhost:5055/#acrostico'); await P.waitForTimeout(2500);
  ok(await P.isHidden('#newVer'),'sin cambios: no hay aviso');
  ok((await P.textContent('#acroNext'))==='Siguiente acróstico','botón Siguiente en el acróstico');
  fs.writeFileSync('etag.txt','v2');
  await P.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await P.waitForTimeout(800);
  ok(await P.isVisible('#newVer'),'versión nueva: '+await P.textContent('#newVer'));
  await br.close(); fs.writeFileSync('etag.txt','v1'); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})();
