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
  // Beto: abre el link, se crea usuario y juega esa partida
  const B=await mk('B'); await B.goto(url.replace(/^https?:\/\/[^/]+\//,URL)); await B.waitForSelector('#userDlg[open]',{timeout:20000});
  ok(/Ana te invitó a jugar Ahorcado/.test(await txt(B,'#uMsg')),'Beto ve: '+await txt(B,'#uMsg'));
  ok(!/\?j=/.test(await B.evaluate(()=>location.href)),'el link se limpia de la barra');
  await user(B,'Beto'); await B.waitForFunction(()=>location.hash==='#ahorcado',null,{timeout:20000});
  await B.waitForFunction(()=>/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000});
  ok((await txt(B,'#view-ahorcado .pid')).replace(/\D/g,'')===n,'Beto juega la misma partida #'+n);
  ok(/Partida compartida por Ana/.test(await txt(B,'#view-ahorcado .pmsg')),'aviso: '+await txt(B,'#view-ahorcado .pmsg'));
  ok(/Beto/.test(await txt(B,'#userBtn')),'Beto quedó con usuario');
  // Carla: abre el link y cierra la ventanita: juega sin usuario
  const C=await mk('C'); await C.goto(url.replace(/^https?:\/\/[^/]+\//,URL)); await C.waitForSelector('#userDlg[open]',{timeout:20000});
  await C.click('#uX'); await C.waitForFunction(()=>location.hash==='#ahorcado'&&/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000});
  ok((await txt(C,'#view-ahorcado .pid')).replace(/\D/g,'')===n,'Carla sin usuario juega la misma partida');
  // Ana la juega también desde el botón
  await A.click('#ivSolo').catch(()=>{}); if(await A.$('#ivOut[open]')) await A.click('#ivLinkSolo');
  await A.waitForFunction(()=>location.hash==='#ahorcado'&&/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000});
  ok((await txt(A,'#view-ahorcado .pid')).replace(/\D/g,'')===n,'Ana también la juega');
  // sopa grande con pistas: el mensaje dice exactamente qué es
  await A.evaluate(()=>location.hash=''); await A.waitForTimeout(400);
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]'); await A.click('#ivSopa button[data-s="grande"]'); await A.click('#ivSopa button[data-m="c"]');
  await A.click('#ivLink'); await A.waitForFunction(()=>/Invitación copiada/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
  const m2=await A.evaluate(()=>navigator.clipboard.readText());
  ok(/en RODO ₿ Games una partida de Sopa de letras Bitcoiner de 15×15, con pistas, en castellano! Entrá con este link: http\S+\?j=sopagrande-es-\d+&m=c&de=/.test(m2),'sopa: '+m2);
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
