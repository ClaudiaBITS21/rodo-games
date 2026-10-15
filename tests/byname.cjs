const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext()).newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const user=async(p,name)=>{ await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); await p.waitForTimeout(1800); };
  const A=await mk('A'), B=await mk('B'), C=await mk('C');
  for(const [p,n] of [[A,'Ana'],[B,'Beto'],[C,'Carla']]){ await p.goto(URL); await ready(p); await user(p,n); }
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="ahorcado"]');
  ok(/Alguien al azar/.test(await txt(A,'#ivWhoSeg')),'opciones: '+await txt(A,'#ivWhoSeg'));
  await A.click('#ivWhoSeg button[data-who="name"]'); await A.waitForTimeout(1200);
  const all=await txt(A,'#ivSugg'); ok(/Beto/.test(all)&&/Carla/.test(all)&&!/Ana/.test(all),'conectados: '+all);
  await A.fill('#ivName','be'); await A.waitForTimeout(400);
  ok(/^\S+ Beto$/u.test(await txt(A,'#ivSugg')),'filtra al escribir: '+await txt(A,'#ivSugg'));
  // alguien entra mientras está abierta la lista
  const D=await mk('D'); await D.goto(URL); await ready(D); await user(D,'Bea'); await A.waitForTimeout(2500);
  ok(/Bea/.test(await txt(A,'#ivSugg')),'aparece en vivo quien entra: '+await txt(A,'#ivSugg'));
  await A.click('#ivSend'); ok(/Elegí a alguien/.test(await txt(A,'#ivOutMsg')),'sin elegir: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivSugg button:has-text("Beto")'); ok(/Beto ✓/.test(await txt(A,'#ivSugg')),'elegido: '+await txt(A,'#ivSugg'));
  await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000}); ok(/Ana te invita/.test(await txt(B,'#ivInT')),'le llega a Beto: '+await txt(B,'#ivInT'));
  ok(!(await C.$('#ivIn[open]')) && !(await D.$('#ivIn[open]')),'a nadie más');
  ok(/Esperando a Beto/.test(await txt(A,'#ivWaitT')),'A espera: '+await txt(A,'#ivWaitT'));
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
