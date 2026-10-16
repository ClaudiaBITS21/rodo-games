// Link con quien invitó en línea: el que entra puede jugar en vivo; motivos de "no disponible"
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
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]');
  await A.click('#ivLink'); await A.waitForFunction(()=>/Invitación copiada/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
  const url=(await A.evaluate(()=>navigator.clipboard.readText())).match(/https?:\S+/)[0].replace(/^https?:\/\/[^/]+\//,URL);
  // Mati abre el link con Ana todavía en la ventanita del link
  // Mati abre el link SIN usuario y elige jugar en vivo; casi a la vez entra Dani
  const B=await mk('B'); await B.goto(url);
  await B.waitForSelector('#lnkDlg[open]',{timeout:20000});
  ok(/Ana está en línea/.test(await txt(B,'#lnkT')) && /Jugar contra Ana ahora/.test(await txt(B,'#lnkLive')),'Mati (sin usuario) ve: '+await txt(B,'#lnkT')+' / '+await txt(B,'#lnkLive'));
  const D=await mk('D'); await D.goto(url); await D.waitForSelector('#lnkDlg[open]',{timeout:20000});
  await B.click('#lnkLive');
  await A.waitForSelector('#ivIn[open]',{timeout:20000});
  ok(/Alguien abrió tu link y te invita a jugar Sopa de letras/.test(await txt(A,'#ivInT')),'a Ana le llega aunque tenía abierta la ventanita del link: '+await txt(A,'#ivInT'));
  await D.click('#lnkLive');
  await D.waitForFunction(()=>/no puede jugar en vivo ahora/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:20000});
  ok(true,'Dani, segundo: '+await txt(D,'#ivOutMsg'));
  await D.click('#ivSolo');
  await D.waitForFunction(()=>location.hash==='#sopa'&&/\d/.test(document.querySelector('#view-sopa .pid').textContent),null,{timeout:20000});
  ok((await txt(D,'#view-sopa .pid')).replace(/\D/g,'')===url.match(/sopa-es-(\d+)/)[1],'Dani juega la partida del link');
  await A.click('#ivYes');
  await A.waitForFunction(()=>location.hash==='#sopa'&&/\d/.test(document.querySelector('#view-sopa .pid').textContent),null,{timeout:20000});
  await B.waitForFunction(()=>location.hash==='#sopa'&&/\d/.test(document.querySelector('#view-sopa .pid').textContent),null,{timeout:20000});
  const na=await txt(A,'#view-sopa .pid'), nb=await txt(B,'#view-sopa .pid');
  ok(na.replace(/\D/g,'')===nb.replace(/\D/g,''),'duelo en vivo, misma partida: '+na);
  ok(await A.evaluate(()=>!!Reg.cur('sopa').duel) && await B.evaluate(()=>!!Reg.cur('sopa').duel),'los dos en duelo');
  // Carla abre el mismo link sin usuario: juega la del link (no se le ofrece en vivo)
  const C=await mk('C'); await C.goto(url); await C.waitForTimeout(2500); if(await C.$('#lnkDlg[open]')) await C.click('#lnkSolo');
  await C.waitForFunction(()=>location.hash==='#sopa'&&/\d/.test(document.querySelector('#view-sopa .pid').textContent),null,{timeout:20000});
  ok(true,'Carla juega la del link');
  await C.click('#view-sopa .gatecard button'); await C.waitForTimeout(1500);
  await C.click('#userBtn'); await user(C,'Carla'); await C.waitForTimeout(2500); if(await C.$('#userDlg[open]')) await C.click('#uX');
  await C.evaluate(()=>Live.beat && Live.beat()); await C.waitForTimeout(1500);
  // Mati termina su duelo con "Me rindo" y lo invita por nombre a Carla, que está jugando una sopa: dice el motivo
  await B.click('#sGiveUp'); await B.click('#sGiveUp'); await B.waitForTimeout(800);
  await B.waitForSelector('#sWin .wuser:not([hidden])',{timeout:10000}); await B.click('#sWin .wuser button'); await user(B,'Mati'); await B.waitForTimeout(2500); if(await B.$('#userDlg[open]')) await B.click('#uX');
  ok(/Mati/.test(await txt(B,'#userBtn')),'Mati eligió usuario al terminar el duelo');
  await B.evaluate(()=>location.hash=''); await B.waitForTimeout(600);
  await B.click('#ivBtn'); await B.click('#ivGames button[data-g="sopa"]');
  if(await B.isVisible('#ivWhoSeg button[data-who="name"]')){
    await B.click('#ivWhoSeg button[data-who="name"]'); await B.fill('#ivName','Carla'); await B.waitForTimeout(2500);
    ok(/Carla · jugando ahora/.test(await txt(B,'#ivSugg')),'en la lista aparece marcada: '+await txt(B,'#ivSugg'));
    await B.click('#ivSugg button');
    await B.click('#ivSend');
    await B.waitForFunction(()=>/está jugando|ya no está|no está recibiendo/.test(document.getElementById('ivOutMsg').textContent),null,{timeout:15000});
    ok(/Carla está jugando una partida de Sopa de letras/.test(await txt(B,'#ivOutMsg')),'motivo: '+await txt(B,'#ivOutMsg'));
  } else ok(false,'no aparece Por nombre');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
