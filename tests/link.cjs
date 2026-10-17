const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const ctx=await br.newContext({viewport:{width:390,height:844}}); await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost:5055'}); const p=await ctx.newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const user=async(p,name)=>{ await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); };
  const A=await mk('A'); await A.goto(URL); await ready(A);
  await A.click('#userBtn'); await user(A,'Ana'); await A.waitForTimeout(2500); if(await A.$('#userDlg[open]')) await A.click('#uX');
  // nadie conectado: elige ahorcado y copia el link
  ok(/Invitar con un link/.test(await txt(A,'#ivBtn')),'botón de la portada sin nadie: '+await txt(A,'#ivBtn'));
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="ahorcado"]');
  await A.click('#ivLink'); await A.waitForFunction(()=>/Invitación copiada|Copiá este mensaje/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
  const msg=await A.$eval('#ivLinkUrl',e=>e.value); const clip=await A.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
  const url=msg.match(/https?:\S+/)[0];
  ok(/^¡Te invito a jugar en RODO ₿ Games una partida de Ahorcado Bitcoiner en castellano! Entrá con este link: http/.test(clip) && clip===msg && /\?j=ahorcado6-es-\d+&de=/.test(url),'copiado: '+clip);
  // con "nadie disponible" también aparece el botón
  ok(!(await A.isVisible('#ivSend')) && !(await A.isVisible('#ivWho')) && /no hay nadie disponible/.test(await txt(A,'#ivLinkNote')),'sin nadie: solo el link, sin Invitar ni ¿A quién?');
  const n=url.match(/ahorcado6-es-(\d+)/)[1];
  ok(/Esperando que se sume el primer jugador… [45]:\d\d/.test(await txt(A,'#ivOutMsg')),'después de copiar: '+await txt(A,'#ivOutMsg'));
  // Beto: abre el link sin usuario y entra directo a la sala de Ana
  const B=await mk('B'); await B.goto(url.replace(/^https?:\/\/[^/]+\//,URL));
  await B.waitForSelector('#salaDlg[open]',{timeout:20000});
  ok(!(await B.$('#userDlg[open]')) && /Sala de Ana/.test(await txt(B,'#salaT')),'Beto entra directo a la sala, sin pedirle usuario');
  ok(!/\?j=/.test(await B.evaluate(()=>location.href)),'el link se limpia de la barra');
  await A.waitForFunction(()=>document.getElementById('salaDlg').open && /2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:20000});
  ok(!(await A.$('#ivOut[open]')),'a Ana la ventanita del link le pasa a la sala con quiénes entraron');
  await A.click('#salaGo');
  await B.waitForFunction(()=>location.hash==='#ahorcado'&&/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000});
  ok((await txt(B,'#view-ahorcado .pid')).replace(/\D/g,'')===n,'Beto juega la misma partida #'+n);
  // Beto se va y vuelve a entrar con el mismo link: retoma la partida y el reloj sigue desde el arranque
  await B.waitForTimeout(8000); await B.goto(url.replace(/^https?:\/\/[^/]+\//,URL));
  await B.waitForFunction(n=>{ const c=Reg.cur('ahorcado'); return location.hash==='#ahorcado' && c && c.n===+n && c.sala && c.t0; },n,{timeout:25000});
  ok(/Volviste a la sala de Ana/.test(await B.evaluate(()=>document.body.textContent)),'Beto vuelve a la misma partida de la sala');
  ok(await B.evaluate(()=>{ const c=Reg.cur('ahorcado'); return c.t0===c.sync && c.t0<c.load; }),'el reloj cuenta desde que arrancaron todos, no desde que volvió');
  // al terminar sin usuario: se le sugiere elegir uno para guardar el resultado
  await B.waitForTimeout(1000); await B.click('#hEnd'); await B.click('#hEnd');
  await B.waitForSelector('#hWin .wuser:not([hidden])',{timeout:10000});
  ok(/guardar este resultado/.test(await txt(B,'#hWin .wuser')),'al terminar: '+await txt(B,'#hWin .wuser'));
  await B.click('#hWin .wuser button'); await user(B,'Beto'); await B.waitForTimeout(2500);
  ok(/Beto/.test(await txt(B,'#userBtn')),'Beto eligió usuario desde el cartel final');
  // sopa grande con pistas: el mensaje dice exactamente qué es
  await A.evaluate(()=>location.hash=''); await A.waitForTimeout(400);
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]'); await A.click('#ivSopa button[data-s="grande"]'); await A.click('#ivSopa button[data-m="c"]');
  await A.click('#ivLink'); await A.waitForFunction(()=>/Invitación copiada/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
  const m2=await A.evaluate(()=>navigator.clipboard.readText());
  ok(/en RODO ₿ Games una partida de Sopa de letras Bitcoiner de 15×15, con pistas, en castellano! Entrá con este link: http\S+\?j=sopagrande-es-\d+&m=c&de=/.test(m2),'sopa: '+m2);
  // Ana cierra la ventanita: la invitación se cancela y a quien llega le dice que ya no está
  await A.click('#ivOutX');
  const C=await mk('C'); await C.goto(m2.match(/https?:\S+/)[0].replace(/^https?:\/\/[^/]+\//,URL));
  await C.waitForSelector('#lnkDlg[open]',{timeout:20000});
  ok(/ya no está disponible/.test(await txt(C,'#lnkT')) && /Invitar yo/.test(await txt(C,'#lnkLive')),'link cancelado: '+await txt(C,'#lnkT'));
  await C.click('#lnkLive');
  await C.waitForFunction(()=>/Esperando que se sume el primer jugador/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
  const m3=await C.evaluate(()=>navigator.clipboard.readText()), cu=await C.evaluate(()=>Reg.uid());
  ok(/Sopa de letras Bitcoiner de 15×15, con pistas/.test(m3) && m3.includes('de='+cu),'arma su propio link con el mismo juego');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
