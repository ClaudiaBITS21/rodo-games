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
  await a.addInitScript(()=>{ window.__admTok=JSON.stringify({sub:'adm1', email:'claudia@rodo.es', email_verified:true}); });
  await a.goto(URL+'#torneo-admin');
  await a.click('#taIn');
  await a.waitForSelector('.tacwr textarea',{timeout:20000, state:'attached'});
  const cw=i=>a.locator('.tacwr textarea').nth(i);
  ok(await a.locator('.tacwr').count()===2,'hay para elegir palabras en el ahorcado y la final, no en la sopa');
  const msg=()=>a.$eval('#taMsg',e=>e.textContent);
  // palabra que no está en el glosario y sin pista: no guarda
  await a.locator('.tacwr summary').nth(0).click().catch(()=>{});
  await cw(0).fill('HALVING\nZAPEAR');
  await a.click('[data-ta="save"]'); await a.waitForTimeout(500);
  ok(/ZAPEAR» no está en el glosario/.test(await msg()),'sin pista no guarda: '+await msg());
  await cw(0).fill('halving\nZapéar = Mandar sats por Nostr\nMEMPOOL');
  await a.locator('.tacwr summary').nth(1).click().catch(()=>{});
  await cw(1).fill('No confíes, verificá.\n— Dicho bitcoiner');
  await a.click('[data-ta="save"]');
  await a.waitForFunction(()=>/Configuración guardada/.test(document.getElementById('taMsg').textContent),null,{timeout:10000});
  const t=await get(T), sec=await get(`${T}/secret/cw`);
  const id0=t.rounds[0].cwid, id2=t.rounds[2].cwid;
  ok(id0 && id2 && !t.rounds[1].cwid && t.rounds[0].n===3,'la configuración guarda solo el identificador y la cantidad: '+JSON.stringify(t.rounds[0]));
  ok(sec && /ZAPEAR|Zapéar/.test(sec[id0]) && /verificá/.test(sec[id2]) && !JSON.stringify(t).includes('MEMPOOL'),'las palabras van aparte, en secret');
  ok(/3 elegidas/.test(await a.$eval('.tacwr summary',e=>e.textContent)),'el resumen dice cuántas: '+await a.$eval('.tacwr summary',e=>e.textContent));
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
    // sopa: cuántas tienen al menos un cruce entre palabras
    let crossed=0; for(let i=0;i<20;i++){ const d=await Reg.genFor('sopa',{L:'es', s:'media'}); const seen=new Map(); let x=false;
      d.words.forEach((w,k)=>w.cells.forEach(c=>{ if(seen.has(c) && seen.get(c)!==k) x=true; seen.set(c,k); })); if(x) crossed++; }
    return {acro:acro.phrase, semi:s.words.join(' '), dec:s.decoys.length, semiBad:semiBad.err, an:an.list.length+':'+an.list.slice(0,2).map(x=>x.w).join(), cr:cr.q[0], crossed};
  });
  ok(g.acro==='STAY HUMBLE','acróstico con la frase elegida');
  ok(g.semi.startsWith('abandon ability') && g.dec===4,'semilla con las palabras elegidas');
  ok(/hola/.test(g.semiBad||''),'semilla: avisa la que no es BIP39: '+g.semiBad);
  ok(g.an==='10:NODO,MINERO','anagrama: las elegidas y el resto del glosario: '+g.an);
  ok(g.cr==='No confíes, verificá.','criptograma con la frase elegida');
  ok(g.crossed>=14,'sopa: las palabras se cruzan ('+g.crossed+' de 20 sopas)');

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
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
