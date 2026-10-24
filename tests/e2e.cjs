const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext()).newPage();
    p.on('pageerror',e=>console.log(n,'pageerror',e.message));
    p.on('console',m=>{ if(m.type()==='error') console.log(n,'console',m.text().slice(0,200)); }); return p; };
  const A=await mk('A'), B=await mk('B');
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const mkUser=async(p,name,pin='123456')=>{ await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin',pin); await p.fill('#uPin2',pin); await p.click('#uGo'); await p.waitForTimeout(1200); };

  await A.goto(URL); await B.goto(URL+'#ahorcado');
  // B empieza un ahorcado
  await B.waitForSelector('#view-ahorcado .gatecard button',{state:'visible'});
  await B.waitForFunction(()=>/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000});
  await B.click('#view-ahorcado .gatecard button'); await B.waitForTimeout(2500);
  // A ve 2 conectados
  await A.waitForFunction(()=>!document.getElementById('live').hidden && /^1 /.test(document.getElementById('liveN').textContent),null,{timeout:40000});
  ok(true,'A ve: '+await txt(A,'#liveN'));
  // sin apodo no deja invitar
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="criptograma"]');
  ok(await A.isVisible('#ivNickRow'),'pide apodo');
  await A.click('#ivSopa button[data-l="en"]');
  ok(/Criptograma en inglés/.test(await txt(A,'#ivOutT')),'paso 2: '+await txt(A,'#ivOutT'));
  await A.click('#ivSend'); ok(/apodo/.test(await txt(A,'#ivOutMsg')),'mensaje: '+await txt(A,'#ivOutMsg'));
  await mkUser(A,'Ana'); await A.click('#ivSend');
  await A.waitForSelector('#ivWait:not([hidden])',{timeout:15000});
  ok(true,'A espera: '+await txt(A,'#ivWaitT')+' | '+await txt(A,'#ivCancel'));
  // B recibe con el cronómetro congelado
  await B.waitForSelector('#ivIn[open]',{timeout:15000});
  ok(/Ana te invita a su sala: Criptograma en inglés/.test(await txt(B,'#ivInT')),'B ve: '+await txt(B,'#ivInT'));
  const bpid=await txt(B,'#view-ahorcado .pid');
  ok(/congelado/.test(await txt(B,'#ivInFz')),'aviso de congelado');
  const cls=await B.$eval('#view-ahorcado .ptime',e=>e.className); ok(/frozen/.test(cls),'reloj del ahorcado congelado ('+cls+')');
  const f1=await txt(B,'#view-ahorcado .ptime'); await B.waitForTimeout(3000); const f2=await txt(B,'#view-ahorcado .ptime');
  ok(f1===f2,`no avanza mientras está congelado (${f1} = ${f2})`);
  ok(/Vence en \d+ s/.test(await txt(B,'#ivInLeft')),'cuenta regresiva: '+await txt(B,'#ivInLeft'));
  await B.click('#ivYes');
  // los dos en la sala de Ana: arranca ella
  await A.waitForFunction(()=>document.getElementById('salaDlg').open && /2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:15000});
  await A.click('#salaGo');
  await A.waitForFunction(()=>location.hash==='#criptograma',null,{timeout:10000});
  await B.waitForFunction(()=>location.hash==='#criptograma',null,{timeout:10000});
  await A.waitForFunction(()=>/\d/.test(document.querySelector('#view-criptograma .pid').textContent));
  await B.waitForFunction(()=>/\d/.test(document.querySelector('#view-criptograma .pid').textContent));
  const pa=await txt(A,'#view-criptograma .pid'), pb=await txt(B,'#view-criptograma .pid');
  ok(pa===pb,`misma partida (${pa} / ${pb})`);
  ok(await B.evaluate(()=>document.documentElement.lang)==='en','B pasó a inglés');
  const qa=await A.$eval('#view-criptograma',e=>e.innerText.slice(0,4000)), qb=await B.$eval('#view-criptograma',e=>e.innerText.slice(0,4000));
  const clean=s=>s.split('\n').filter(l=>!/jugando|terminó|Empieza|Iniciar|arranca|Duelo|playing|finished|Starts|Start|Duel|aceptó|accepted|both start|Sala|Juegan|room|at once|same time/.test(l)).join('\n').replace(/\d+:\d+/g,'');
  if(clean(qa)!==clean(qb)){ const x=clean(qa).split('\n'), y=clean(qb).split('\n'); x.forEach((l,i)=>{ if(l!==y[i]) console.log('DIFF',JSON.stringify(l),'|',JSON.stringify(y[i])); }); }
  ok(clean(qa)===clean(qb),'mismo contenido en las dos pantallas');
  // B vuelve al ahorcado: sigue desde donde quedó
  await B.waitForTimeout(4000);
  await B.evaluate(()=>location.hash='ahorcado'); await B.waitForTimeout(1200);
  const f3=await txt(B,'#view-ahorcado .ptime'), cls3=await B.$eval('#view-ahorcado .ptime',e=>e.className);
  const sec=s=>s.replace(/[^\d:]/g,'').split(':').reduce((a,b)=>a*60+ +b,0);
  ok(!/frozen/.test(cls3) && sec(f3)-sec(f2)<=3,`al volver sigue el reloj (${f2} → ${f3})`);
  ok((await txt(B,'#view-ahorcado .pid')).replace(/\D/g,'')===bpid.replace(/\D/g,''),'su ahorcado en castellano sigue intacto');
  // los dos vuelven a castellano desde la portada
  await B.evaluate(()=>location.hash=''); await B.waitForTimeout(400); await B.click('.lang button[data-lang="es"]');
  await A.evaluate(()=>location.hash=''); await A.waitForTimeout(400); await A.click('.lang button[data-lang="es"]');
  // B no recibe invitaciones mientras tiene una sala viva: se prueba con otra y después se lo da por vencido
  await A.evaluate(()=>location.hash=''); await A.waitForTimeout(500);
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="anagrama"]'); await A.click('#ivSend');
  await A.waitForSelector('#ivDone:not([hidden])',{timeout:15000}); ok(!(await B.$('#ivIn[open]')),'jugando en una sala no le llegan invitaciones: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivOutX').catch(()=>{}); await A.waitForTimeout(500);
  await B.evaluate(()=>['criptograma','sopa','ahorcado','acrostico','anagrama','semilla'].forEach(g=>{ const c=Reg.cur(g); if(c&&(c.duel||c.sala)) c.t0-=17*60000; }));
  // rechazo
  await A.evaluate(()=>location.hash=''); await A.waitForTimeout(500);
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="anagrama"]'); await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000}); await B.click('#ivNo');
  await A.waitForSelector('#ivDone:not([hidden])',{timeout:10000});
  ok(/no aceptó/.test(await txt(A,'#ivOutMsg')),'A ve: '+await txt(A,'#ivOutMsg'));
  ok(!/frozen/.test(await B.$eval('#view-ahorcado .ptime',e=>e.className)),'B: reloj descongelado tras rechazar');
  // "Invitar a otro": no vuelve a elegir a B
  await A.click('#ivAgain'); await A.waitForTimeout(1500);
  ok(/No hay nadie/.test(await txt(A,'#ivOutMsg')),'invitar a otro: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivOutX');
  // B tiene un ahorcado en curso: no se lo invita a ahorcado
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="ahorcado"]'); await A.click('#ivSend'); await A.waitForTimeout(1500);
  ok(/No hay nadie/.test(await txt(A,'#ivOutMsg')),'ahorcado en curso, no se lo invita: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivOutX');
  // B no quiere invitaciones
  await B.evaluate(()=>location.hash=''); await B.waitForSelector('#live:not([hidden])');
  await B.uncheck('#ivRecv'); await B.waitForTimeout(1500);
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]'); await A.click('#ivSend'); await A.waitForTimeout(1500);
  ok(/No hay nadie/.test(await txt(A,'#ivOutMsg')),'B sin invitaciones: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivOutX');
  // vencimiento (sesiones nuevas: B rechazó antes una al azar y A lo tiene anotado)
  await B.evaluate(()=>sessionStorage.clear()); await A.reload(); await A.waitForFunction(()=>Reg.uid&&Reg.uid(),null,{timeout:20000}); await A.waitForSelector('#live:not([hidden])');
  await B.check('#ivRecv'); await B.waitForTimeout(1500);
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]'); await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000});
  await B.waitForTimeout(62000);
  ok(!(await B.$('#ivIn[open]')),'B: la ventanita se cerró al vencer');
  ok(/no respondió/.test(await txt(A,'#ivOutMsg')),'A ve: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivSolo'); await A.waitForFunction(()=>location.hash==='#sopa'); await A.waitForTimeout(1500);
  ok(/\d/.test(await txt(A,'#view-sopa .pid')),'jugarla solo abre la partida: '+await txt(A,'#view-sopa .pid'));
  await A.screenshot({path:'a.png'}); 
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
