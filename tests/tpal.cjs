// Torneo: palabras y frases que elige el organizador (panel con Google simulado en el emulador), sopa con cruces y cartel del campeón
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const db = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  const get = async p => { let v=null; await db(async f => { const s=await F.getDoc(F.doc(f, p)); v=s.exists() ? s.data() : null; }); return v; };
  const until = async (fn, ms=20000) => { const t=Date.now(); while(Date.now()-t<ms){ const v=await fn(); if(v) return v; await new Promise(r=>setTimeout(r,500)); } return null; };
  const T='tourneys/T1';
  await db(async f => {
    await F.setDoc(F.doc(f, T), { name:'PRUEBA GAMES', st:'checkin', cap:64, fee:0, lnurl:'', when:null, orgs:[], bases:'', lang:'es', cur:0,
      rounds:[{g:'ahorcado',lang:'es',n:6,dur:10},{g:'sopa',lang:'es',s:'media',m:'w',dur:10},{g:'criptograma',lang:'es',dur:0}], champ:null, auto:true, at:F.Timestamp.now() });
    for(const n of [1,2,3]) await F.setDoc(F.doc(f, `${T}/ins/bot-${n}`), { nm:'Bot '+n, av:'🤖', bot:true, at:F.Timestamp.now(), ck:F.Timestamp.now(), paid:false, out:false });
  });
  const br=await chromium.launch();
  const a=await (await br.newContext({viewport:{width:1300,height:900}})).newPage();
  a.on('pageerror',e=>console.log('pageerror',e.message));
  await a.addInitScript(()=>{ window.__admTok=JSON.stringify({sub:'adm1', email:'claudia@rodo.es', email_verified:true});
    window.__clip=''; try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{ window.__clip=t; }}}); }catch(e){} });
  await a.goto(URL+'#torneo-admin');
  await a.click('#taIn');
  await a.waitForSelector('.tacwr textarea',{timeout:20000, state:'attached'});
  const cw=i=>a.locator('.tacwr textarea').nth(i);
  ok(await a.locator('.tacwr').count()===2,'hay para elegir palabras en el ahorcado y la final, no en la sopa');
  const msg=()=>a.$eval('#taMsg',e=>e.textContent);
  // palabra que no está en el glosario y sin pista: guarda, avisa y el pedido para Claude la lleva
  await a.locator('.tacwr summary').nth(0).click().catch(()=>{});
  await cw(0).fill('HALVING\nZAPEAR\nMEMPOOL');
  await a.click('[data-ta="save"]');
  await a.waitForFunction(()=>/Configuración guardada/.test(document.getElementById('taMsg').textContent),null,{timeout:10000});
  ok(/Faltan pistas: ronda 1: ZAPEAR/.test(await msg()),'guarda y avisa la pista que falta: '+await msg());
  // arranque: por defecto lo inicia la administración; se puede elegir automático
  ok(await a.$eval('[data-f="ast"]',e=>e.value)==='0' && /Arranque a mano/.test(await a.$eval('#taCtl',e=>e.textContent)),'sin elegir, el arranque es a mano');
  ok(!(await a.$('[data-f="cap"]')),'ya no hay cupo: juegan todos');
  await a.selectOption('[data-f="ast"]','1'); await a.click('[data-ta="save"]');
  ok(!!(await until(async()=>{ const x=await get(T); return x && x.ast===true; })),'elegir «Automático» guarda ast');
  ok(await a.evaluate(()=>Math.min(MAX_ADV,pow2below(100))===32 && Math.min(MAX_ADV,pow2below(40))===32 && Math.min(MAX_ADV,pow2below(20))===16),'con más de 64 anotados juegan todos y pasan 32');
  ok(/falta 1 pista/.test(await a.$eval('.tacwr summary',e=>e.textContent)),'el resumen lo marca');
  await a.click('[data-ta="cwask"]'); await a.waitForTimeout(300);
  const ask=await a.evaluate(()=>window.__clip);
  ok(/PALABRA = pista/.test(ask) && /\nZAPEAR$/.test(ask) && !/HALVING/.test(ask),'pedido para Claude solo con las que faltan');
  // sin la pista, la ronda no se programa
  await a.click('[data-ta="startnow"]'); await a.click('[data-ta="startnow"]'); await a.waitForTimeout(800);
  ok(/faltan las pistas de ZAPEAR/.test(await msg()) && !(await get(`${T}/rounds/1`)),'sin pista no arranca: '+await msg());
  // se pega la respuesta de Claude abajo de la lista
  await cw(0).fill('halving\nZapéar\nMEMPOOL\nZAPEAR = Mandar sats por Nostr');
  // elegir del glosario: tildar y destildar
  await a.locator('[data-ta="cwlist"]').nth(0).click();
  ok(await a.locator('.tacwr').nth(0).locator('.cwi').count()===218,'la lista trae las 218 palabras del glosario');
  await a.locator('.tacwr').nth(0).locator('.cwlist').screenshot({path:__dirname+'/tpal-lista.png'});
  await a.locator('.tacwr').nth(0).locator('.cwq').fill('hodl');
  ok(await a.locator('.tacwr').nth(0).locator('.cwi:not([hidden])').count()<=3,'el buscador filtra');
  ok(await a.locator('.tacwr').nth(0).locator('[data-cw="MEMPOOL"]').isChecked(),'las que ya están en la caja aparecen tildadas');
  await a.locator('.tacwr').nth(0).locator('[data-cw="HODL"]').check();
  ok(/\nHODL = \S/.test(await cw(0).inputValue()),'tildar la suma a la lista, con su pista');
  await a.locator('.tacwr').nth(0).locator('[data-cw="HODL"]').uncheck();
  ok(!/HODL/.test(await cw(0).inputValue()),'destildar la saca');
  // la otra tabla: el glosario en inglés
  await a.locator('.tacwr').nth(0).locator('[data-ta="cwtab"][data-t="en"]').click();
  ok(await a.locator('.tacwr').nth(0).locator('[data-cw="SIGNATURE"]').count()===1 && await a.locator('.tacwr').nth(0).locator('.cwi').count()===218,'la tabla en inglés');
  await a.locator('.tacwr').nth(0).locator('[data-cw="SIGNATURE"]').check();
  ok(/\nSIGNATURE = \S/.test(await cw(0).inputValue()),'se puede elegir de la tabla en inglés: '+await cw(0).inputValue());
  await a.locator('.tacwr').nth(0).locator('[data-cw="SIGNATURE"]').uncheck();
  // la final (criptograma): elegir una de las frases del juego
  await a.locator('.tacwr summary').nth(1).click().catch(()=>{});
  await a.locator('[data-ta="cwlist"]').nth(1).click();
  await a.locator('.tacwr').nth(1).locator('[data-cwp]').first().check();
  ok(/^El problema de fondo del dinero convencional.*\n— Satoshi Nakamoto, 2009$/.test(await cw(1).inputValue()),'elegir una frase la pone en la caja');
  await cw(1).fill('No confíes, verificá.\n— Dicho bitcoiner');
  await a.click('[data-ta="save"]');
  await a.waitForFunction(()=>/Configuración guardada/.test(document.getElementById('taMsg').textContent),null,{timeout:10000});
  ok(await a.isVisible('#taToast') && /Configuración guardada/.test(await a.$eval('#taToast',e=>e.textContent)),'el aviso de guardado se ve abajo, flotando');
  const t=await get(T), sec=await get(`${T}/secret/cw`);
  const id0=t.rounds[0].cwid, id2=t.rounds[2].cwid;
  ok(id0 && id2 && !t.rounds[1].cwid && t.rounds[0].n===3,'la configuración guarda solo el identificador y la cantidad: '+JSON.stringify(t.rounds[0]));
  ok(sec && /ZAPEAR|Zapéar/.test(sec[id0]) && /verificá/.test(sec[id2]) && !JSON.stringify(t).includes('MEMPOOL'),'las palabras van aparte, en secret');
  ok(/3 elegidas/.test(await a.$eval('.tacwr summary',e=>e.textContent)),'el resumen dice cuántas: '+await a.$eval('.tacwr summary',e=>e.textContent));
  // otra ronda de anagrama: las palabras del ahorcado aparecen como «ya en la ronda 1»; filtro por categoría
  await a.click('[data-ta="addr"]');
  await a.waitForFunction(()=>document.querySelectorAll('.tacwr').length===3,null,{timeout:10000});
  await a.locator('.tacwr summary').nth(1).click().catch(()=>{});
  await a.locator('[data-ta="cwlist"]').nth(1).click();
  const mem=a.locator('.tacwr').nth(1).locator('.cwi:has([data-cw="MEMPOOL"])');
  ok(/ya en la ronda 1/.test(await mem.textContent()) && await mem.locator('input').isDisabled(),'lo elegido en otra ronda no se repite: '+(await mem.textContent()).replace(/\s+/g,' '));
  await a.locator('.tacwr').nth(1).locator('.cwk').selectOption('sigla');
  const sig=await a.locator('.tacwr').nth(1).locator('.cwi:not([hidden]) b').allTextContents();
  ok(sig.includes('UTXO') && sig.includes('KYC') && !sig.includes('BITCOIN'),'filtro por categoría (siglas): '+sig.join(' '));
  // arrancar: la ronda 1 sale con esas palabras
  await a.click('[data-ta="startnow"]'); await a.click('[data-ta="startnow"]');
  const p=await until(()=>get(`${T}/rounds/1/data/p`));
  const r1=await get(`${T}/rounds/1`);
  ok(p && p.d.list.map(x=>x.w).join()==='HALVING,ZAPEAR,MEMPOOL' && p.d.list[1].c==='Mandar sats por Nostr' && p.d.list[0].c,'ahorcado con las palabras elegidas: '+JSON.stringify(p&&p.d.list));
  ok(r1 && r1.n===3 && r1.nr===3,'la ronda cuenta 3 palabras');
  // los otros juegos, directo en la página
  const g=await a.evaluate(async()=>{
    const acro=await Reg.genFor('acrostico',{L:'es', cw:cwParse('acrostico','Stay humble','es').v});
    const semi=cwParse('semilla','abandon ability able about above absent absorb abstract absurd abuse access accident','en');
    const semiBad=cwParse('semilla','abandon hola','en');
    const s=await Reg.genFor('semilla',{L:'en', cw:semi.v});
    const an=await Reg.genFor('anagrama',{L:'es', cw:cwParse('anagrama','NODO\nMINERO','es').v});
    const cr=await Reg.genFor('criptograma',{L:'es', cw:cwParse('criptograma','No confíes, verificá.','es').v});
    // al azar no se usan las palabras elegidas para otras rondas
    const av=G_ES.slice(0,150).map(x=>x[0]), an2=await Reg.genFor('anagrama',{L:'es', avoid:av}), ac2=await Reg.genFor('acrostico',{L:'es', avoid:av});
    const avoidOk=an2.list.every(x=>!av.includes(x.w)) && ac2.rows.every(r=>r.gap || r.given || !av.includes(r.word));
    // sopa: cuántas tienen al menos un cruce entre palabras
    let crossed=0; for(let i=0;i<20;i++){ const d=await Reg.genFor('sopa',{L:'es', s:'media'}); const seen=new Map(); let x=false;
      d.words.forEach((w,k)=>w.cells.forEach(c=>{ if(seen.has(c) && seen.get(c)!==k) x=true; seen.set(c,k); })); if(x) crossed++; }
    return {acro:acro.phrase, semi:s.words.join(' '), dec:s.decoys.length, semiBad:semiBad.err, an:an.list.length+':'+an.list.slice(0,2).map(x=>x.w).join(), cr:cr.q[0], crossed, avoidOk};
  });
  ok(g.acro==='STAY HUMBLE','acróstico con la frase elegida');
  ok(g.semi.startsWith('abandon ability') && g.dec===4,'semilla con las palabras elegidas');
  ok(/hola/.test(g.semiBad||''),'semilla: avisa la que no es BIP39: '+g.semiBad);
  ok(g.an==='10:NODO,MINERO','anagrama: las elegidas y el resto del glosario: '+g.an);
  ok(g.cr==='No confíes, verificá.','criptograma con la frase elegida');
  ok(g.avoidOk,'el anagrama y el acróstico al azar no usan las palabras elegidas para otras rondas');
  ok(g.crossed>=14,'sopa: las palabras se cruzan ('+g.crossed+' de 20 sopas)');

  // varios torneos: el selector va por fecha y hora de arranque; se puede borrar uno con todo lo que tiene
  await db(async f => {
    await F.setDoc(F.doc(f, 'tourneys/T3'), { name:'MAS LEJOS', st:'open', cap:64, fee:0, lnurl:'', when:F.Timestamp.fromMillis(Date.now()+9*86400000), orgs:[], bases:'', lang:'es', cur:0, rounds:[{g:'sopa',lang:'es',dur:10}], champ:null, auto:true, at:F.Timestamp.now() });
    await F.setDoc(F.doc(f, 'tourneys/T2'), { name:'MAS CERCA', st:'open', cap:64, fee:0, lnurl:'', when:F.Timestamp.fromMillis(Date.now()+2*86400000), orgs:[], bases:'', lang:'es', cur:0, rounds:[{g:'sopa',lang:'es',dur:10}], champ:null, auto:true, at:F.Timestamp.fromMillis(Date.now()-86400000) });
    await F.setDoc(F.doc(f, 'tourneys/T2/ins/u1'), { nm:'X', av:'', at:F.Timestamp.now(), ck:null, paid:false, out:false });
    await F.setDoc(F.doc(f, 'tourneys/T2/priv/u1'), { mail:'x@x.com', tel:'123456', ok:true, at:F.Timestamp.now() });
  });
  await a.waitForFunction(()=>document.querySelectorAll('#taPick select option').length===3,null,{timeout:15000});
  const opts=await a.$$eval('#taPick select option',l=>l.map(o=>o.textContent));
  ok(/MAS CERCA/.test(opts[0]) && /MAS LEJOS/.test(opts[1]) && /PRUEBA GAMES/.test(opts[2]),'ordenados por fecha de arranque: '+opts.join(' | '));
  await a.selectOption('#taPick select','T2'); await a.waitForTimeout(800);
  await a.click('[data-ta="deltour"]'); await a.click('[data-ta="deltour"]');
  await a.waitForFunction(()=>/Se borró «MAS CERCA»/.test(document.getElementById('taMsg').textContent),null,{timeout:15000});
  ok(!(await get('tourneys/T2')) && !(await get('tourneys/T2/ins/u1')) && !(await get('tourneys/T2/priv/u1')),'borrado con sus inscriptos y datos privados');
  await a.waitForFunction(()=>document.querySelectorAll('#taPick select option').length===2,null,{timeout:10000});
  ok(true,'ya no está en la lista');
  // el campeón: cartel a pantalla completa en su pantalla, una sola vez
  const j=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
  j.on('pageerror',e=>console.log('pageerror',e.message));
  await j.goto(URL); await j.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const uid=await j.evaluate(()=>Reg.uid());
  await db(async f => {
    await F.setDoc(F.doc(f, `${T}/ins/${uid}`), { nm:'Ana', av:'🦊', at:F.Timestamp.now(), ck:F.Timestamp.now(), paid:false, out:false });
    await F.updateDoc(F.doc(f, T), { st:'done', champ:uid });
  });
  await j.waitForSelector('.champfx',{timeout:20000});
  const txt=await j.$eval('.champfx',e=>e.textContent.replace(/\s+/g,' '));
  ok(/¡Ganaste, Ana!/.test(txt) && /🦊/.test(txt) && /PRUEBA GAMES/.test(txt),'cartel del campeón: '+txt);
  await j.waitForTimeout(1500); await j.screenshot({path:__dirname+'/campeon.png'});
  await j.click('.cfx-ok'); ok(!(await j.$('.champfx')),'se cierra');
  await j.reload(); await j.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000}); await j.waitForTimeout(3000);
  ok(!(await j.$('.champfx')),'no vuelve a aparecer');
  // un organizador de un solo torneo que entra por «Entrar como administrador» va directo a su panel y ve solo ese
  await db(async f => { await F.setDoc(F.doc(f, 'tourneys/T9'), { name:'SOLO DE MATI', st:'open', cap:64, fee:0, lnurl:'', when:null, orgs:['mati@x.com'], bases:'', lang:'es', cur:0,
    rounds:[{g:'sopa',lang:'es',s:'media',m:'w',dur:10}], champ:null, at:F.Timestamp.now() }); });
  const o=await (await br.newContext({viewport:{width:1300,height:900}})).newPage(); o.on('pageerror',e=>console.log('org pageerror',e.message));
  await o.addInitScript(()=>{ window.__admTok=JSON.stringify({sub:'org1', email:'mati@x.com', email_verified:true}); });
  await o.goto(URL+'#admin'); await o.click('#admIn');
  await o.waitForFunction(()=>location.hash==='#torneo-admin',null,{timeout:20000}).catch(()=>{});
  await o.waitForSelector('#taBody:not([hidden]) [data-ta="pick"]',{timeout:20000}).catch(()=>{});
  const oOpts=await o.$$eval('[data-ta="pick"] option',l=>l.map(x=>x.textContent)).catch(()=>[]);
  ok(await o.evaluate(()=>location.hash)==='#torneo-admin' && oOpts.length===1 && /SOLO DE MATI/.test(oOpts[0]),'el organizador va directo a su torneo: '+oOpts.join(' | '));
  // QR para inscribirse: a pantalla completa, con el link directo a la sala de ese torneo
  await o.click('[data-ta="qr"]'); await o.waitForSelector('.tqr svg',{timeout:10000}).catch(()=>{});
  await o.screenshot({path:__dirname+'/qr-torneo.png'});
  const qr=await o.$eval('.tqr',e=>e.textContent.replace(/\s+/g,' ')).catch(()=>'');
  ok(!!(await o.$('.tqr svg')) && /SOLO DE MATI/.test(qr) && /\?t=T9/.test(qr) && /Escaneá/.test(qr),'QR del torneo: '+qr.slice(0,140));
  await o.click('.tqr [data-q="x"]'); ok(!(await o.$('.tqr')),'el QR se cierra');
  const v=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); v.on('pageerror',e=>console.log('qr pageerror',e.message));
  await v.goto(URL+'?t=T9');
  // sin usuario: se abre solo «Elegí tu usuario»; al crearlo queda anotado, sin tocar más botones
  await v.waitForSelector('#userDlg[open]',{timeout:20000}).catch(()=>{});
  ok(!!(await v.$('#userDlg[open]')) && await v.evaluate(()=>location.hash)==='#torneo' && !/\?t=/.test(await v.evaluate(()=>location.search)),'el QR abre directo la ventanita para crear el usuario');
  await v.fill('#uName','Lucia'); await v.fill('#uPin','123456'); await v.fill('#uPin2','123456'); await v.click('#uGo');
  await v.waitForTimeout(2500); if(await v.$('#userDlg[open]')) await v.click('#uX');
  const vu=await v.evaluate(()=>Reg.uid());
  const vi=await until(()=>get(`tourneys/T9/ins/${vu}`));
  ok(vi && vi.nm==='Lucia','y queda anotada en ese torneo');
  await v.waitForFunction(()=>/estás anotado/.test(document.getElementById('view-torneo').textContent),null,{timeout:10000}).catch(()=>{});
  ok(/SOLO DE MATI/.test(await v.$eval('#view-torneo',e=>e.textContent)) && /estás anotado/.test(await v.$eval('#view-torneo',e=>e.textContent)),'y la sala lo confirma');
  // con check-in abierto y usuario ya hecho: queda anotado y con check-in solo
  await db(async f => { await F.updateDoc(F.doc(f,'tourneys/T9'),{st:'checkin'}); });
  const w2=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); w2.on('pageerror',e=>console.log('qr2 pageerror',e.message));
  await w2.goto(URL); await w2.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  await w2.click('#userBtn'); await w2.waitForSelector('#userDlg[open]'); await w2.fill('#uName','Pedro'); await w2.fill('#uPin','123456'); await w2.fill('#uPin2','123456'); await w2.click('#uGo');
  await w2.waitForTimeout(2500); if(await w2.$('#userDlg[open]')) await w2.click('#uX');
  await w2.goto(URL+'?t=T9'); await w2.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid()&&Reg.nick(),null,{timeout:20000});
  const wu=await w2.evaluate(()=>Reg.uid());
  const wi=await until(async()=>{ const x=await get(`tourneys/T9/ins/${wu}`); return x && x.ck && x; });
  ok(!!wi,'con usuario y check-in abierto: anotado y con check-in, sin botones');
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
