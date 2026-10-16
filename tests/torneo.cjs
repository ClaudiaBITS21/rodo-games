// Torneo: inscripción con mail y teléfono, check-in, entrar a la ronda en vivo y guardar el resultado
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const db = async fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  const get = async p => { let v=null; await db(async f => { const s=await F.getDoc(F.doc(f, p)); v=s.exists() ? s.data() : null; }); return v; };
  const until = async (fn, ms=20000) => { const t=Date.now(); while(Date.now()-t<ms){ const v=await fn(); if(v) return v; await new Promise(r=>setTimeout(r,500)); } return null; };
  const T='tourneys/T1';
  await db(f => F.setDoc(F.doc(f, T), { name:'PRUEBA GAMES', st:'open', cap:64, fee:2100, lnurl:'', when:null, orgs:[], bases:'Bases de prueba', lang:'es', cur:0,
    rounds:[{g:'sopa',lang:'es',s:'media',m:'w',dur:10}], champ:null, auto:true, at:F.Timestamp.now() }));
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:390,height:844}}); const A=await ctx.newPage();
  A.on('pageerror',e=>console.log('A pageerror',e.message));
  const txt=s=>A.$eval(s,e=>e.textContent.trim());
  await A.goto(URL); await A.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  await A.waitForSelector('#tBanner:not([hidden])',{timeout:15000});
  ok(/PRUEBA GAMES/.test(await txt('#tBanner')),'la portada muestra el torneo: '+await txt('#tBanner'));
  await A.click('#userBtn'); await A.waitForSelector('#userDlg[open]'); await A.fill('#uName','Ana'); await A.fill('#uPin','123456'); await A.fill('#uPin2','123456'); await A.click('#uGo');
  await A.waitForTimeout(2500); if(await A.$('#userDlg[open]')) await A.click('#uX');
  const uid=await A.evaluate(()=>Reg.uid());
  await A.evaluate(()=>location.hash='torneo');
  await A.waitForSelector('#tMail',{timeout:15000});
  await A.fill('#tMail','ana@example.com'); await A.fill('#tTel','1155554444'); await A.check('#tOk'); await A.click('[data-act="join"]');
  const ins=await until(()=>get(`${T}/ins/${uid}`));
  ok(ins && ins.nm==='Ana' && ins.ck===null,'Ana se inscribió');
  ok(!!(await get(`${T}/priv/${uid}`)),'mail y teléfono en priv');
  await db(f => F.updateDoc(F.doc(f, T), { st:'checkin' }));
  await A.waitForSelector('[data-act="ck"]',{timeout:15000}); await A.click('[data-act="ck"]');
  ok(await until(async()=>{ const x=await get(`${T}/ins/${uid}`); return x && x.ck; }),'check-in hecho');
  // el organizador arranca la ronda (acá la escribe la prueba): Ana entra sola a la partida
  const d=await A.evaluate(async()=>JSON.parse(JSON.stringify(await Reg.genFor('sopa',{L:'es', s:'media'}))));
  const now=Date.now();
  await db(async f => {
    await F.setDoc(F.doc(f, `${T}/rounds/1`), { no:1, ci:0, g:'sopa', k:'sopa', lang:'es', dur:10, nr:0, final:true, pl:[uid], adv:1, st:'live',
      go:F.Timestamp.fromMillis(now-1000), end:F.Timestamp.fromMillis(now+600000), left:0, s:'media', m:'w', at:F.Timestamp.now() });
    await F.setDoc(F.doc(f, `${T}/rounds/1/data/p`), { d });
    await F.updateDoc(F.doc(f, T), { st:'live', cur:1 });
  });
  await A.waitForFunction(()=>location.hash==='#sopa' || document.querySelector('[data-act="play"]'),null,{timeout:20000});
  if(await A.$('[data-act="play"]') && !(await A.evaluate(()=>location.hash==='#sopa'))) await A.click('[data-act="play"]');
  await A.waitForFunction(()=>{ const c=Reg.cur('sopa'); return location.hash==='#sopa' && c && c.tour; },null,{timeout:20000});
  ok(true,'Ana juega la ronda del torneo');
  await A.waitForTimeout(6000);
  ok(await until(()=>get(`${T}/rounds/1/res/${uid}`),12000),'guarda el avance mientras juega');
  await A.click('#sGiveUp'); await A.click('#sGiveUp');
  const r=await until(async()=>{ const x=await get(`${T}/rounds/1/res/${uid}`); return x && x.done && x; });
  ok(r && r.done && r.ok===false && r.x===false,'resultado final guardado (se rindió): '+JSON.stringify(r&&{done:r.done,ok:r.ok,p:r.p}));
  ok(await A.evaluate(()=>tScore({go:{toMillis:()=>1000}, nr:0, k:'sopa'}, {done:true, ok:true, at:{toMillis:()=>61000}, e:1, h:0, c:0, f:0}).pts)===930,'tScore: 60 s y un error → 930');
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
