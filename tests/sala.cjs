// Sala: varias personas en la misma partida del link, arranque con «Iniciar ya», podio y otra ronda
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const ctx=await br.newContext({viewport:{width:390,height:844}}); await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost:5055'}); const p=await ctx.newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const user=async(p,name)=>{ await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); };
  const pid=p=>p.evaluate(()=>{ const c=Reg.cur('sopa'); return c&&c.n ? `${c.k}-${c.lang}-${c.n}` : ''; });
  const A=await mk('A'); await A.goto(URL); await ready(A);
  await A.click('#userBtn'); await user(A,'Ana'); await A.waitForTimeout(2500); if(await A.$('#userDlg[open]')) await A.click('#uX');
  const D=await mk('D'); await D.goto(URL); await ready(D);
  await D.click('#userBtn'); await user(D,'Dani'); await D.waitForTimeout(2500); if(await D.$('#userDlg[open]')) await D.click('#uX');
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]');
  await A.click('#ivLink'); await A.waitForFunction(()=>/Invitación copiada/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
  ok(/Esperando que se sume el primer jugador/.test(await txt(A,'#ivOutMsg')),'después de copiar: '+await txt(A,'#ivOutMsg'));
  const url=(await A.evaluate(()=>navigator.clipboard.readText())).match(/https?:\S+/)[0].replace(/^https?:\/\/[^/]+\//,URL);
  // Mati (sin usuario) entra y juega en vivo: se abre la sala
  const B=await mk('B'); await B.goto(url); await B.waitForSelector('#salaDlg[open]',{timeout:20000});
  await A.waitForFunction(()=>/2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:20000});
  // Dani abre el mismo link: ve la sala y se suma
  await D.goto(url); await D.waitForSelector('#salaDlg[open]',{timeout:20000});
  ok(/Sala de Ana/.test(await txt(D,'#salaT')),'Dani entra directo: '+await txt(D,'#salaWho'));
  await A.waitForFunction(()=>/3 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:20000});
  ok(/Ana \(vos\).*Dani|Dani.*Ana \(vos\)/.test(await txt(A,'#salaWho')) && /Jugador/.test(await txt(A,'#salaWho')),'Ana ve: '+await txt(A,'#salaWho'));
  await D.waitForFunction(()=>/Esperando que se sumen… [45]:\d\d/.test(document.getElementById('salaWait').textContent),null,{timeout:5000}).catch(()=>{});
  ok(/Esperando que se sumen… [45]:\d\d/.test(await txt(D,'#salaWait')),'cuenta de los 5 minutos: '+await txt(D,'#salaWait'));
  await A.click('#salaGo');
  for(const [p,n] of [[A,'Ana'],[B,'Mati'],[D,'Dani']]) await p.waitForFunction(()=>location.hash==='#sopa'&&Reg.cur('sopa')&&Reg.cur('sopa').sala&&Reg.cur('sopa').n,null,{timeout:20000});
  const pa=await pid(A), pb=await pid(B), pd=await pid(D);
  ok(pa && pa===pb && pa===pd,'los tres en la misma partida: '+[pa,pb,pd].join(' '));
  ok(/Sala de Ana: 3 jugadores/.test(await D.evaluate(()=>document.body.textContent)),'aviso de arranque con la cantidad');
  await A.waitForTimeout(6000);
  ok(/Juegan 3 a la vez/.test(await A.evaluate(()=>document.body.textContent)),'mientras nadie terminó: «Juegan 3 a la vez…»');
  // Mati resuelve (se simula con su resultado), Ana se rinde: todavía se define y «Otra ronda» espera a Dani
  await B.evaluate(()=>{ document.getElementById('sWin').style.display='block'; Reg.finish('sopa',{ok:true,s:0,h:0,ms:200000}); });
  await A.waitForFunction(()=>/1 de 2 ya terminaron · Jugador \d va primero/.test(document.body.textContent),null,{timeout:15000});
  ok(true,'Ana ve quién va primero mientras juega');
  await B.waitForSelector('#sWin .wsala:not([hidden])',{timeout:10000});
  await B.waitForFunction(()=>/todavía pueden ganarte si terminan en menos de \d:\d\d/.test(document.querySelector('#sWin .sastat').textContent),null,{timeout:10000});
  ok(/Sala · 3 jugadores/.test(await txt(B,'#sWin .wsala')) && /jugando…/.test(await txt(B,'#sWin .wsala')),'Mati ve: '+await txt(B,'#sWin .sastat'));
  ok(!(await B.$('#sWin .saAgain')),'«Otra ronda» solo para Ana');
  await A.click('#sGiveUp'); await A.click('#sGiveUp');
  await A.waitForSelector('#sWin .wsala:not([hidden])',{timeout:10000});
  ok(/todavía se define/.test(await txt(A,'#sWin .sastat')) && !(await A.$('#sWin .saAgain')) && /cuando terminen todos/.test(await txt(A,'#sWin .wsala')),'Ana terminó pero Dani sigue: sin «Otra ronda» · '+await txt(A,'#sWin .sastat'));
  await D.click('#sGiveUp'); await D.click('#sGiveUp');
  await A.waitForSelector('#sWin .saAgain',{timeout:10000});
  ok(/Ganó Jugador \d/.test(await txt(A,'#sWin .sastat')),'terminaron todos: '+await txt(A,'#sWin .sastat'));
  await B.waitForFunction(()=>/Ganaste esta/.test(document.querySelector('#sWin .sastat').textContent),null,{timeout:10000});
  ok(true,'Mati ve «¡Ganaste esta!»');
  // otra ronda: Ana la abre, Dani se suma desde su cartel
  await A.click('#sWin .saAgain');
  await A.waitForFunction(()=>document.getElementById('salaDlg').open && /1 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:20000});
  await D.waitForSelector('#sWin .saJoin',{timeout:15000});
  ok(/Ana abrió otra ronda/.test(await txt(D,'#sWin .wsala')),'Dani ve: '+await txt(D,'#sWin .sanext'));
  await D.click('#sWin .saJoin');
  await A.waitForFunction(()=>/2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:15000});
  await A.click('#salaGo');
  await A.waitForFunction(p=>{ const c=Reg.cur('sopa'); return c&&c.n&&`${c.k}-${c.lang}-${c.n}`!==p; },pa,{timeout:20000});
  await D.waitForFunction(p=>{ const c=Reg.cur('sopa'); return c&&c.n&&`${c.k}-${c.lang}-${c.n}`!==p; },pa,{timeout:20000});
  const qa=await pid(A), qd=await pid(D);
  ok(qa===qd && qa!==pa,'segunda ronda, partida nueva para los dos: '+qa);
  ok(await pid(B)===pa,'Mati, que no se sumó, sigue en la anterior');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
