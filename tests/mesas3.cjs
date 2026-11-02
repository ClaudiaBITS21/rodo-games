// Torneo por mesas: cada partida dura lo que dice «Minutos»; al acabarse el tiempo se cierra sin resolver y la mesa pasa sola a la siguiente
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const db = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  const get = async p => { let v=null; await db(async f => { const s=await F.getDoc(F.doc(f, p)); v=s.exists() ? s.data() : null; }); return v; };
  const until = async (fn, ms=30000) => { const t=Date.now(); while(Date.now()-t<ms){ const v=await fn(); if(v) return v; await new Promise(r=>setTimeout(r,400)); } return null; };
  const br=await chromium.launch();
  const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.goto(URL); await p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const uid=await p.evaluate(()=>Reg.uid());
  // dos partidas de 0,15 minutos (9 s) y una sin minutos (queda en 7)
  const P=await p.evaluate(()=>[GAMES.anagrama.gen(), GAMES.criptograma.gen(), GAMES.anagrama.gen()]);
  await db(async f=>{
    await F.setDoc(F.doc(f,'tourneys/MT'),{name:'MESAS RAPIDAS', mode:'mesas', st:'live', cap:64, fee:0, lnurl:'', when:null, orgs:[], bases:'', lang:'es', cur:0,
      rounds:[{g:'anagrama',lang:'es',dur:0.15},{g:'criptograma',lang:'es',dur:0.15},{g:'anagrama',lang:'es'}], champ:null, go:F.Timestamp.fromMillis(Date.now()-1000), at:F.Timestamp.now()});
    await F.setDoc(F.doc(f,'tourneys/MT/groups/g1'),{i:1, nm:'Mesa 1', em:'', mem:{[uid]:{n:'Ana', t:1}}, cap:uid, req:null, res:{}});
    for(const [i,g] of [[0,'anagrama'],[1,'criptograma'],[2,'anagrama']]) await F.setDoc(F.doc(f,`tourneys/MT/mpz/${i}`),{i, g, k:g, lang:'es', nr:g==='anagrama'?10:0, d:JSON.parse(JSON.stringify(P[i]))});
  });
  await p.goto(URL+'?mesa=MT~g1');
  await p.waitForFunction(()=>location.hash==='#anagrama' && !document.getElementById('mesaTop').hidden,null,{timeout:30000});
  ok(/Sin resolver a los 0.15 min/.test(await p.$eval('#mesaTop',e=>e.textContent)),'la barra dice los minutos de esa partida');
  // el capitán no hace nada: a los 9 s se cierra y pasa sola a la siguiente
  const r0=await until(async()=>{ const x=await get('tourneys/MT/groups/g1'); return x.res && x.res['0']; }, 30000);
  ok(r0 && r0.ok===false,'al acabarse el tiempo, la partida se cierra sin resolver (0 puntos)');
  await p.waitForFunction(()=>location.hash==='#criptograma',null,{timeout:20000}).catch(()=>{});
  ok(await p.evaluate(()=>location.hash)==='#criptograma','y la mesa pasa sola a la siguiente partida');
  const r1=await until(async()=>{ const x=await get('tourneys/MT/groups/g1'); return x.res && x.res['1']; }, 30000);
  ok(r1 && r1.ok===false,'la segunda también se cierra a su tiempo');
  await p.waitForFunction(()=>location.hash==='#anagrama' && /Partida 3 de 3/.test(document.getElementById('mesaTop').textContent),null,{timeout:20000}).catch(()=>{});
  ok(/Sin resolver a los 7 min/.test(await p.$eval('#mesaTop',e=>e.textContent)) && /⏱ [67]:\d\d/.test(await p.$eval('#mesaTop',e=>e.textContent)),'sin minutos cargados, la partida dura 7: '+(await p.$eval('#mesaTop .mtop1',e=>e.textContent).catch(()=>'-')));
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
