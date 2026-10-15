const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch(); const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
  p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.goto(URL); await p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]');
  const n=await p.$$eval('#uAvs button',b=>b.length), last=await p.$eval('#uAvs button:last-child',b=>b.textContent);
  ok(n===20 && last==='+','20 lugares y el último es +: '+last);
  await p.click('#uAvs .avplus'); ok(await p.isVisible('#uAvIn'),'aparece el campo para el emoji');
  await p.fill('#uAvIn','hola'); ok(/no es un emoji/.test(await p.$eval('#uAvHint',e=>e.textContent)),'texto que no es emoji: avisa');
  await p.fill('#uAvIn','🇦🇷'); await p.waitForTimeout(200);
  ok(!(await p.isVisible('#uAvIn')) && await p.$eval('#uAvs .avplus',b=>b.textContent+'|'+b.getAttribute('aria-pressed'))==='🇦🇷|true','elige 🇦🇷 y queda marcado en el +');
  await p.fill('#uName','Gaucho'); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo');
  await p.waitForFunction(()=>/Listo/.test(document.getElementById('uMsg').textContent),null,{timeout:20000});
  ok((await p.$eval('#userBtn',e=>e.textContent))==='🇦🇷 Gaucho','usuario con bandera: '+await p.$eval('#userBtn',e=>e.textContent));
  // ya con usuario: cambia por otro emoji libre
  await p.click('#uX'); await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]');
  await p.click('#uAvs .avplus'); await p.fill('#uAvIn','👨‍👩‍👧'); await p.waitForFunction(()=>/Avatar|avatar/.test(document.getElementById('uMsg').textContent),null,{timeout:10000});
  ok((await p.$eval('#userBtn',e=>e.textContent))==='👨‍👩‍👧 Gaucho','cambia a 👨‍👩‍👧: '+await p.$eval('#uMsg',e=>e.textContent));
  const nm=await (await fetch(FS+'names',{headers:{Authorization:'Bearer owner'}})).json();
  ok(nm.documents[0].fields.av.stringValue==='👨‍👩‍👧','guardado en la base');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
