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
  const all = async p => { const v=[]; await db(async f => { (await F.getDocs(F.collection(f, p))).forEach(d=>v.push(d.data())); }); return v; };
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
  // un solo QR: todos entran a una sala de espera común; la organización reparte las mesas y a cada uno le aparece la suya
  await db(async f=>{
    await F.setDoc(F.doc(f,'tourneys/MR'),{name:'MESAS AL AZAR', mode:'mesas', asg:'azar', st:'open', cap:64, fee:0, lnurl:'', when:null, orgs:[], bases:'', lang:'es', cur:0,
      rounds:[{g:'anagrama',lang:'es',dur:7}], champ:null, go:null, at:F.Timestamp.now()});
    for(const i of [1,2]) await F.setDoc(F.doc(f,`tourneys/MR/groups/r${i}`),{i, nm:'Mesa '+i, em:i===1?'🍀':'', mem:{}, cap:null, req:null, res:{}});
  });
  const who=[];
  for(const n of ['Uno','Dos','Tres']){
    const q=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); q.on('pageerror',e=>console.log(n,'pageerror',e.message));
    await q.goto(URL+'?mesas=MR'); await q.waitForSelector('#mName',{timeout:20000});
    if(n==='Uno') ok(/sala de espera/.test(await q.$eval('#mesaBody',e=>e.textContent)),'con el QR único, la entrada dice que se entra a la sala de espera');
    await q.fill('#mName',n); await q.click('[data-mesa="join"]'); await q.waitForSelector('.mpool',{timeout:15000});
    who.push(q);
  }
  await who[0].waitForFunction(()=>/\(3\)/.test(document.querySelector('.mpool').textContent),null,{timeout:10000}).catch(()=>{});
  const pc=await who[0].$eval('.mpool',e=>e.textContent.replace(/\s+/g,' '));
  ok(/Sala de espera/.test(pc) && /Esperando que la organización reparta los grupos/.test(pc) && /En la sala de espera \(3\)/.test(pc) && /Tres/.test(pc),'sala de espera común con quiénes están: '+pc.slice(0,140));
  let gs={}; await db(async f=>{ (await F.getDocs(F.collection(f,'tourneys/MR/groups'))).forEach(d=>gs[d.id]=Object.keys(d.data().mem||{}).length); });
  ok(gs.r1===0 && gs.r2===0,'mientras esperan, nadie está en una mesa');
  await who[2].click('[data-mesa="qrpool"]'); await who[2].waitForSelector('.tqr svg',{timeout:10000}).catch(()=>{});
  ok((await who[2].$eval('.tqr',e=>e.textContent)).includes('?mesas=MR'),'desde la sala de espera se muestra el QR único para sumar amigos');
  await who[2].click('.tqr [data-q="x"]');
  // la organización reparte desde el panel
  const a=await (await br.newContext({viewport:{width:1200,height:900}})).newPage(); a.on('pageerror',e=>console.log('panel pageerror',e.message));
  await a.addInitScript(()=>{ window.__admTok=JSON.stringify({sub:'adm1', email:'claudia@rodo.es', email_verified:true}); try{ sessionStorage.setItem('rodo-tid','MR'); }catch(e){} });
  await a.goto(URL+'#torneo-admin'); await a.click('#taIn');
  await a.waitForSelector('[data-ta="mdeal"]:not([disabled])',{timeout:20000}).catch(()=>{});
  ok(/Sala de espera: 3 sin grupo/.test(await a.$eval('#taLive',e=>e.textContent).catch(()=>'')),'el panel muestra cuántos esperan mesa');
  await a.fill('#taDealV','3'); await a.selectOption('#taDealM','n'); await a.click('[data-ta="mdeal"]');
  ok(!!(await until(async()=>{ const x={}; await db(async f=>{ (await F.getDocs(F.collection(f,'tourneys/MR/groups'))).forEach(d=>x[d.id]=Object.keys(d.data().mem||{}).length); }); gs=x; return Object.values(x).reduce((a,b)=>a+b,0)===3; }, 15000)),'«Repartir grupos» pone a todos en un grupo');
  ok(Object.keys(gs).length===3 && Object.values(gs).every(v=>v===1),'repartir en 3 grupos crea el que falta y queda uno en cada uno: '+JSON.stringify(gs));
  await who[0].waitForSelector('.mlobby:not(.mpool)',{timeout:15000}).catch(()=>{});
  const card=await who[0].$eval('.mlobby',e=>e.textContent.replace(/\s+/g,' '));
  ok(/Te tocó este grupo/.test(card) && /(Mesa|Grupo) [123]/.test(card) && /Uno/.test(card) && /Esperando que empiece el torneo/.test(card),'a cada uno le aparece su mesa: '+card.slice(0,120));
  const g0=await who[0].evaluate(()=>JSON.parse(localStorage.getItem('rodo-mesa')).gid);
  await who[0].goto(URL+'?mesas=MR'); await who[0].waitForSelector('.mlobby:not(.mpool)',{timeout:20000}).catch(()=>{});
  ok(await who[0].evaluate(()=>JSON.parse(localStorage.getItem('rodo-mesa')).gid)===g0 && /Uno/.test(await who[0].$eval('.mlobby',e=>e.textContent)),'si vuelve a escanear el QR único, vuelve a su misma mesa');
  await who[1].click('[data-mesa="qr"]'); await who[1].waitForSelector('.tqr svg',{timeout:10000}).catch(()=>{});
  const g1=await who[1].evaluate(()=>JSON.parse(localStorage.getItem('rodo-mesa')).gid);
  ok((await who[1].$eval('.tqr',e=>e.textContent)).includes('?mesa=MR~'+g1),'ya con mesa, el QR que muestra lleva a su propia mesa');
  // uno que llega tarde con el torneo en juego: el panel lo reparte solo
  await db(async f=>{ await F.updateDoc(F.doc(f,'tourneys/MR'),{st:'live', go:F.Timestamp.fromMillis(Date.now()+600000)}); });
  const q4=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
  await q4.goto(URL+'?mesas=MR'); await q4.waitForSelector('#mName',{timeout:20000}); await q4.fill('#mName','Tarde'); await q4.click('[data-mesa="join"]');
  await q4.waitForSelector('.mlobby:not(.mpool)',{timeout:30000}).catch(()=>{});
  ok(/Tarde/.test(await q4.$eval('.mlobby',e=>e.textContent).catch(()=>'')) && !(await q4.$('.mpool')),'con el torneo en juego, el que llega tarde queda con mesa solo');
  // de a N personas por grupo: con 2 por grupo y 4 personas en total, alcanza con los grupos que hay
  // con un QR por grupo: «Agregar grupo y mostrar su QR» crea uno y muestra su QR
  await db(async f=>{ await F.updateDoc(F.doc(f,'tourneys/MR'),{st:'open', go:null, asg:'qr'}); });
  await a.waitForSelector('[data-ta="mqradd"]',{timeout:15000}).catch(()=>{});
  const nG=(await all('tourneys/MR/groups')).length;
  await a.click('[data-ta="mqradd"]'); await a.waitForSelector('.tqr svg',{timeout:10000}).catch(()=>{});
  const G2=await all('tourneys/MR/groups'), nw=G2.find(x=>x.i===Math.max(...G2.map(y=>y.i)));
  ok(G2.length===nG+1 && /Grupo \d/.test(nw.nm) && (await a.$eval('.tqr',e=>e.textContent)).includes('?mesa=MR~'),'«Agregar grupo y mostrar su QR» crea un grupo y muestra su QR: '+nw.nm);
  await a.click('.tqr [data-q="x"]');
  await a.click('[data-ta="mqrg"]'); await a.waitForSelector('.tqr svg',{timeout:10000}).catch(()=>{});
  ok(!!(await a.$('.tqr svg')),'cada grupo de la lista tiene su botón de QR');
  // ya arrancado, con QR por grupo: el que escanea el QR de un grupo lleno va al que tiene menos gente
  await a.click('.tqr [data-q="x"]').catch(()=>{});
  await db(async f=>{ await F.updateDoc(F.doc(f,'tourneys/MR'),{st:'live', go:F.Timestamp.fromMillis(Date.now()+600000)}); });
  const G3={}; await db(async f=>{ (await F.getDocs(F.collection(f,'tourneys/MR/groups'))).forEach(d=>G3[d.id]=Object.keys(d.data().mem||{}).length); });
  const full=Object.keys(G3).find(g=>G3[g]>0), empty=Object.keys(G3).filter(g=>G3[g]===0);
  const q5=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); q5.on('pageerror',e=>console.log('q5 pageerror',e.message));
  await q5.goto(URL+'?mesa=MR~'+full); await q5.waitForSelector('#mName',{timeout:20000});
  ok(/ya arrancó/.test(await q5.$eval('#mesaBody',e=>e.textContent)),'ya arrancado, la entrada avisa que va al grupo con menos gente');
  await q5.fill('#mName','Nueva'); await q5.click('[data-mesa="join"]'); await q5.waitForSelector('.mlobby',{timeout:15000}).catch(()=>{});
  const where=await until(async()=>{ let w=null; await db(async f=>{ (await F.getDocs(F.collection(f,'tourneys/MR/groups'))).forEach(d=>{ if(Object.values(d.data().mem||{}).some(m=>m.n==='Nueva')) w=d.id; }); }); return w; }, 10000);
  ok(empty.length>0 && empty.includes(where),'ya arrancado, quien escanea el QR de un grupo queda en el que tiene menos gente: '+where+' de '+JSON.stringify(G3));
  ok(/Te tocó este grupo/.test(await q5.$eval('.mlobby',e=>e.textContent).catch(()=>'')),'y le avisa qué grupo le tocó');
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
