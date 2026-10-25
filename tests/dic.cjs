// Diccionarios en el panel (Google simulado en el emulador): secciones, editar, ocultar, sumar una palabra y replicarla traducida
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const get = async p => { let v=null; await env.withSecurityRulesDisabled(async c => { const s=await F.getDoc(F.doc(c.firestore(), p)); v=s.exists() ? s.data() : null; }); return v; };
  const until = async (fn, ms=15000) => { const t=Date.now(); while(Date.now()-t<ms){ const v=await fn(); if(v) return v; await new Promise(r=>setTimeout(r,400)); } return null; };
  const br=await chromium.launch();
  const a=await (await br.newContext({viewport:{width:1300,height:900}})).newPage();
  a.on('pageerror',e=>console.log('pageerror',e.message)); 
  await a.addInitScript(()=>{ window.__admTok=JSON.stringify({sub:'adm1', email:'claudia@rodo.es', email_verified:true});
    window.__clip=''; try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{ window.__clip=t; }}}); }catch(e){} });
  await a.goto(URL+'#admin'); await a.click('#admIn');
  await a.waitForSelector('#admBody [data-admtab="dic"]',{timeout:30000});
  await a.click('#admBody [data-admtab="dic"]');
  const sec=()=>a.$eval('#admBody .admsec[data-sec="dic"]',e=>e.textContent.replace(/\s+/g,' '));
  const t0=await sec();
  ok(/En los dos diccionarios \(\d+\)/.test(t0) && /Solo en castellano \(\d+\)/.test(t0) && /Solo en inglés \(\d+\)/.test(t0),'secciones: '+(t0.match(/En los dos diccionarios \(\d+\)|Solo en castellano \(\d+\)|Solo en inglés \(\d+\)/g)||[]).join(' · '));
  // categorías: filtro por sigla
  await a.click('#admBody [data-dcat="sigla"]');
  const sig=await a.$$eval('#admBody .dword:not([hidden]) .dent b',l=>l.map(e=>e.textContent));
  ok(sig.includes('UTXO') && sig.includes('KYC') && !sig.includes('BITCOIN'),'filtro por categoría: '+sig.slice(0,12).join(' '));
  await a.click('#admBody [data-dcat=""]');
  // BITCOIN está en los dos: se abren los dos formularios
  const first=a.locator('#admBody .admsec[data-sec="dic"] .dword').first();
  await first.locator('summary').click(); await first.locator('.dform').nth(1).waitFor({timeout:5000});
  await a.screenshot({path:__dirname+'/diccionarios.png'});
  ok(await first.locator('.dform').count()===2,'una palabra repetida muestra su entrada en castellano y en inglés');
  await first.locator('.dform[data-lg="es"] input[name="c0"]').fill('La primera moneda sin dueño');
  await first.locator('.dform[data-lg="es"] input[name="k"][value="his"]').check();
  await first.locator('.dform[data-lg="es"] button').click();
  const e1=await until(async()=>{ const x=await get('dict/es-1'); return x && x.c && x.c[0]==='La primera moneda sin dueño' && x; });
  ok(!!e1 && !e1.tr && e1.k.includes('his') && e1.k.includes('eco'),'editar una pista y las categorías lo guarda en dict/es-1: '+JSON.stringify(e1&&e1.k));
  ok(await a.evaluate(()=>G_ES[0][1][0])==='La primera moneda sin dueño','y el glosario de la página ya la usa');
  // ocultar una palabra que está solo en castellano
  await a.fill('#admBody .dq','vuelto'); await a.waitForTimeout(200);
  const v=a.locator('#admBody .dword:not([hidden])',{hasText:'VUELTO'}).first(); await v.locator('summary').click();
  await v.locator('.dform input[name="off"]').check(); await v.locator('.dform button').click();
  const off=await until(async()=>{ const x=await get('dict/es-127'); return x && x.off && x; });
  ok(!!off,'ocultar VUELTO guarda off');
  ok(await a.evaluate(()=>{ const prev=lang; lang='es'; try{ return !gloss().some(x=>x[0]==='VUELTO'); } finally{ lang=prev; } }),'VUELTO ya no sale en los juegos');
  await a.fill('#admBody .dq','');
  // palabra nueva en castellano, replicada en inglés: queda pendiente de traducir
  await a.click('#admBody [data-dnew="es"]');
  const f=a.locator('#admBody .dnew .dform');
  await f.locator('input[name="w"]').fill('Zapear'); await f.locator('input[name="c0"]').fill('Mandar sats con un toque en Nostr');
  await f.locator('textarea[name="d"]').fill('Enviar una propina en sats por Lightning a una publicación de Nostr.');
  await f.locator('input[name="rep"]').check(); await f.locator('button').click();
  const nES=await until(()=>get('dict/es-219')), nEN=await until(()=>get('dict/en-219'));
  ok(nES && nES.w==='ZAPEAR' && !nES.off,'ZAPEAR suma la 219 en castellano');
  ok(nEN && nEN.tr && nEN.off && nEN.src==='es-219','en inglés queda pendiente de traducir y oculta');
  await a.waitForSelector('#admBody #dAsk',{timeout:5000});
  ok(/1 pendiente de traducir/.test(await sec()) && /\(1\)/.test(await a.$eval('#admBody [data-admtab="dic"]',e=>e.textContent)),'el panel avisa la pendiente');
  await a.click('#admBody #dAsk'); await a.waitForTimeout(200);
  const ask=await a.evaluate(()=>window.__clip);
  ok(/"id": "en-219"/.test(ask) && /ZAPEAR/.test(ask) && /Respondé solo con un JSON/.test(ask),'pedido de traducción para Claude');
  await a.fill('#admBody #dAns','```json\n[{"id":"en-219","w":"Zapping","c":["Tip sats with one tap on Nostr","A Lightning tip on a post","Sats sent as applause"],"d":"Sending a small Lightning tip in sats to a Nostr post."}]\n```');
  await a.fill('#admBody #dAns','[{"id":"en-219","w":"Zap","c":["x"],"d":"y"}]'); await a.click('#admBody #dApply');
  await a.waitForFunction(()=>/ya está en inglés/.test(document.querySelector('#admBody .dmsg')?.textContent||''),null,{timeout:8000})
    .then(()=>ok(true,'si la traducción ya existe (ZAP), avisa y no la duplica'), ()=>ok(false,'aviso de traducción repetida'));
  await a.fill('#admBody #dAns','```json\n[{"id":"en-219","w":"Zapping","c":["Tip sats with one tap on Nostr","A Lightning tip on a post","Sats sent as applause"],"d":"Sending a small Lightning tip in sats to a Nostr post."}]\n```');
  await a.click('#admBody #dApply');
  const tEN=await until(async()=>{ const x=await get('dict/en-219'); return x && !x.tr && x; });
  ok(tEN && tEN.w==='ZAPPING' && !tEN.off && tEN.c.length===3,'la traducción se aplica y la palabra sale en inglés: '+JSON.stringify(tEN&&{w:tEN.w,off:tEN.off})+' '+await a.$eval('#admBody .dmsg',e=>e.textContent).catch(()=>'-'));
  // un jugador cualquiera ve los cambios al entrar
  const p=await (await br.newContext()).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.goto(URL); await p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000}); await p.waitForTimeout(1500);
  const g=await p.evaluate(()=>({es:G_ES[218]&&G_ES[218][0], en:G_EN[218]&&G_EN[218][0], c:G_ES[0][1][0], code:CLUES.byText.es.get('Mandar sats con un toque en Nostr')}));
  ok(g.es==='ZAPEAR' && g.en==='ZAPPING' && g.c==='La primera moneda sin dueño' && g.code==='219.1','el sitio carga los diccionarios editados: '+JSON.stringify(g));
  // criptograma: quién lo dijo, entre paréntesis y a la derecha
  await p.evaluate(()=>{ GAMES.criptograma.load({q:['No confíes, verificá.','Dicho bitcoiner'], map:GAMES.criptograma.gen().map}); });
  const au=await p.$eval('#cAuthor',e=>[e.textContent, getComputedStyle(e).textAlign]);
  ok(au[0]==='(Dicho bitcoiner)' && au[1]==='right','autor del criptograma: '+au.join(' · '));
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
