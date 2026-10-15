const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext()).newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); p.on('dialog',d=>{ console.log('DIALOG '+d.message()); d.accept(); }); return p; };
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const user=async(p,name)=>{ await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); await p.waitForTimeout(1800); };
  const A=await mk('A'); await A.goto(URL); await ready(A); await A.waitForSelector('#live:not([hidden])',{timeout:30000});
  ok(/Nadie disponible/.test(await txt(A,'#liveN')),'solo: '+await txt(A,'#liveN'));
  const B=await mk('B'), C=await mk('C'), X=await mk('X');
  for(const [p,n] of [[A,'Ana'],[B,'Beto'],[C,'Carla']]){ if(p!==A){ await p.goto(URL); await ready(p); } await user(p,n); }
  await X.goto(URL); await ready(X);   // sin usuario
  await A.reload(); await ready(A); await A.waitForFunction(()=>/^3 /.test(document.getElementById('liveN').textContent),null,{timeout:40000});
  ok(true,'no me cuenta a mí: '+await txt(A,'#liveN'));
  await A.click('#liveMore'); await A.waitForTimeout(1500);
  const l=await txt(A,'#liveList'); ok(/Beto/.test(l)&&/Carla/.test(l)&&/1 sin usuario/.test(l)&&!/Ana/.test(l),'lista: '+l);
  // C deja de recibir invitaciones
  await C.uncheck('#ivRecv'); await A.waitForTimeout(2500);
  ok(!/Carla/.test(await txt(A,'#liveList')),'quien destilda sale de la lista en vivo: '+await txt(A,'#liveList'));
  await A.click('#liveList .liveu:has-text("Beto")'); await A.waitForSelector('#ivOut[open]');
  await A.click('#ivGames button[data-g="criptograma"]');
  ok(/Beto ✓/.test(await txt(A,'#ivSugg')),'la invitación ya viene con Beto: '+await txt(A,'#ivSugg'));
  await A.click('#ivSend'); await B.waitForSelector('#ivIn[open]',{timeout:15000}); ok(true,'le llega a Beto');
  await B.click('#ivNo'); await A.click('#ivOutX').catch(()=>{});
  // me rindo en el acróstico
  await A.evaluate(()=>location.hash='acrostico'); await A.waitForFunction(()=>/\d/.test(document.querySelector('#view-acrostico .pid').textContent),null,{timeout:20000});
  await A.click('#view-acrostico .gatecard button'); await A.click('#acroGiveUp'); await A.click('#acroGiveUp'); await A.waitForSelector('#win',{state:'visible'});
  ok(/Te rendiste/.test(await txt(A,'#winLabel')) && /0 puntos/.test(await txt(A,'#view-acrostico .wpts')),'me rindo: '+await txt(A,'#winLabel')+' / '+await txt(A,'#view-acrostico .wpts'));
  ok(await A.$$eval('#grid .cell.miss',e=>e.length)>0,'muestra la solución marcada');
  await A.click('#win .lchips button'); await A.waitForFunction(()=>/Sumaste 1 palabra/.test(document.querySelector('#win .wlearn').textContent),null,{timeout:10000});
  const wl=await A.$eval('#win .wlearn',e=>e.innerText.replace(/\s+/g,' ')); ok(/Marcá las palabras que no conocías/.test(wl) && (await A.$$eval('#win .lcard',d=>d.length))===1,'marca una y aparece su definición: '+wl.slice(0,200));
  const le=await (await fetch(FS+'learned',{headers:{Authorization:'Bearer owner'}})).json();
  const f=le.documents[0].fields; ok(f.yes.booleanValue && +f.n.integerValue>0,'guardado: n='+f.n.integerValue);
  await A.evaluate(()=>location.hash='stats'); await A.waitForFunction(()=>/Mi glosario/.test(document.getElementById('stBody').textContent),null,{timeout:20000});
  ok(true,'estadísticas: '+(await A.$eval('#stBody',e=>e.innerText)).match(/Dijiste[^\n]*/)[0]);
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
