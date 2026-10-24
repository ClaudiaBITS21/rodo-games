// «Invitar a jugar» abre una sala: quien acepta se suma, desde la sala se invita a más y se arranca cuando se quiera
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const user=async(p,name)=>{ await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); await p.waitForTimeout(1800); if(await p.$('#userDlg[open]')) await p.click('#uX'); };
  const pid=p=>p.evaluate(()=>{ const c=Reg.cur('ahorcado'); return c&&c.n ? `${c.k}-${c.lang}-${c.n}` : ''; });
  const A=await mk('A'), B=await mk('B'), C=await mk('C');
  for(const [p,n] of [[A,'Ana'],[B,'Beto'],[C,'Carla']]){ await p.goto(URL); await ready(p); await user(p,n); }
  // Ana invita a Beto por nombre
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="ahorcado"]');
  await A.click('#ivWhoSeg button[data-who="name"]'); await A.waitForTimeout(1200);
  await A.click('#ivSugg button:has-text("Beto")'); await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000});
  ok(/Ana te invita a su sala/.test(await txt(B,'#ivInT')) && /Pueden sumarse más/.test(await txt(B,'#ivInT')),'la invitación es a la sala: '+await txt(B,'#ivInT'));
  await B.click('#ivYes');
  // los dos en la sala; Ana puede invitar a más y arrancar
  await A.waitForFunction(()=>document.getElementById('salaDlg').open && /2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:20000});
  await B.waitForFunction(()=>document.getElementById('salaDlg').open && /Sala de Ana/.test(document.getElementById('salaT').textContent),null,{timeout:20000});
  ok(true,'Beto aceptó: los dos en la sala de Ana');
  ok(!(await A.$('#salaMore[hidden]')) && /Invitar a más/.test(await txt(A,'#salaMore')),'Ana tiene «Invitar a más»');
  ok(!!(await B.$('#salaMore[hidden]')) && !!(await B.$('#salaGo[hidden]')),'Beto no tiene «Invitar a más» ni «Iniciar ya»');
  // Ana invita a Carla desde la sala (al azar: Beto ya está adentro, así que le toca a Carla)
  await A.click('#salaMore');
  await A.waitForSelector('#ivOut[open]',{timeout:5000});
  ok(!!(await A.$('#ivSopa[hidden]')) && !!(await A.$('#ivLink[hidden]')),'el juego ya está elegido: solo «¿A quién?»');
  await A.click('#ivWhoSeg button[data-who="rnd"]').catch(()=>{});
  await A.click('#ivSend');
  await C.waitForSelector('#ivIn[open]',{timeout:15000});
  ok(/Ana te invita a su sala/.test(await txt(C,'#ivInT')),'le llega a Carla');
  ok(!(await B.$('#ivIn[open]')),'a Beto, que ya está en la sala, no');
  await C.click('#ivYes');
  await A.waitForFunction(()=>document.getElementById('salaDlg').open && /3 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:20000});
  ok(/Beto/.test(await txt(A,'#salaWho')) && /Carla/.test(await txt(A,'#salaWho')),'Ana vuelve a la sala: '+await txt(A,'#salaWho'));
  // arrancar cuando quiera, sin esperar los 5 minutos
  await A.click('#salaGo');
  for(const p of [A,B,C]) await p.waitForFunction(()=>location.hash==='#ahorcado'&&Reg.cur('ahorcado')&&Reg.cur('ahorcado').sala&&Reg.cur('ahorcado').n,null,{timeout:20000});
  const pa=await pid(A), pb=await pid(B), pc=await pid(C);
  ok(pa && pa===pb && pa===pc,'los tres en la misma partida: '+[pa,pb,pc].join(' '));
  ok(/Sala de Ana: 3 jugadores/.test(await C.evaluate(()=>document.body.textContent)),'arrancan todos a la vez');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
