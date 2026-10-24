// Torneo: escenario de la sala (cuenta regresiva, gente que entra, quiénes siguen, gran final y campeón)
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const db = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  const T='tourneys/T1', min=60000, now=Date.now();
  const bot=(n,o={})=>({ nm:'Bot'+n, av:['🦊','🐻','🐸','🐼','🦁'][n-1], at:F.Timestamp.fromMillis(now+n), ck:null, paid:false, out:false, ...o });
  await db(async f => {
    await F.setDoc(F.doc(f, T), { name:'PRUEBA GAMES', st:'open', cap:64, fee:0, lnurl:'', when:F.Timestamp.fromMillis(now+20*min), orgs:[], bases:'', lang:'es', cur:0,
      rounds:[{g:'sopa',lang:'es',s:'media',m:'w',dur:10},{g:'anagrama',lang:'es',dur:10}], champ:null, auto:true, at:F.Timestamp.now() });
    for(const n of [1,2,3,4]) await F.setDoc(F.doc(f, `${T}/ins/bot-${n}`), bot(n));
  });
  const br=await chromium.launch(); const A=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
  A.on('pageerror',e=>console.log('A pageerror',e.message));
  const st=()=>A.$eval('#tStage',e=>e.textContent.replace(/\s+/g,' ').trim()).catch(()=> '');
  const wait=(fn,arg)=>A.waitForFunction(fn,arg,{timeout:25000});
  await A.goto(URL+'#torneo'); await A.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  await wait(()=>document.querySelectorAll('#tStage .tp').length===4);
  ok(/La cuenta regresiva arranca a las/.test(await st()) && /4\s*jugadores anotados/.test(await st()),'antes de los 10 min: '+await st());
  // 5 minutos antes: cuenta regresiva grande
  await db(f => F.updateDoc(F.doc(f, T), { when:F.Timestamp.fromMillis(Date.now()+5*min) }));
  await wait(()=>document.querySelector('#tStage .tcd'));
  ok(/^[45]:\d\d$/.test(await A.$eval('#tStage .tcd',e=>e.textContent)),'cuenta regresiva: '+await A.$eval('#tStage .tcd',e=>e.textContent));
  // entra alguien más: aparece con animación
  await db(f => F.setDoc(F.doc(f, `${T}/ins/bot-5`), bot(5)));
  await wait(()=>document.querySelectorAll('#tStage .tp').length===5);
  ok(/Bot5/.test(await A.$eval('#tStage .tp.pop',e=>e.textContent).catch(()=> '')),'el nuevo entra con animación');
  // check-in: los confirmados adelante, el resto atenuado
  await db(async f => { await F.updateDoc(F.doc(f, T), { st:'checkin' }); for(const n of [1,2]) await F.updateDoc(F.doc(f, `${T}/ins/bot-${n}`), { ck:F.Timestamp.now() }); });
  await wait(()=>document.querySelectorAll('#tStage .tp.dim').length===3);
  ok(/2\s*confirmaron/.test(await st()),'check-in: '+await st());
  // ronda 1 cerrada: siguen 2 de 4, los otros quedaron afuera
  const pl=['bot-1','bot-2','bot-3','bot-4'];
  await db(async f => {
    await F.updateDoc(F.doc(f, T), { st:'live', cur:1 });
    await F.setDoc(F.doc(f, `${T}/rounds/1`), { no:1, ci:0, g:'sopa', k:'sopa', lang:'es', dur:10, nr:0, final:false, pl, adv:2, st:'closed', q:['bot-1','bot-2'], pos:{}, go:F.Timestamp.fromMillis(now-9*min), end:F.Timestamp.fromMillis(now-min), left:0, at:F.Timestamp.now() });
  });
  await wait(()=>document.querySelectorAll('#tStage .tp.out').length===2);
  ok(/siguen 2 de 4/.test(await st()) && /Quedaron afuera/.test(await st()),'entre rondas: '+await st());
  // la final: los dos, grandes
  await db(f => F.setDoc(F.doc(f, `${T}/rounds/2`), { no:2, ci:1, g:'anagrama', k:'anagrama', lang:'es', dur:10, nr:10, final:true, pl:['bot-1','bot-2'], adv:1, st:'sched', go:F.Timestamp.fromMillis(Date.now()+5*min), end:null, left:0, at:F.Timestamp.now() }));
  await wait(()=>document.querySelectorAll('#tStage .tvs .tp').length===2);
  ok(/Gran final/.test(await st()) && /Bot1.*⚔️.*Bot2/.test(await st()),'final: '+await st());
  // campeón
  await db(f => F.updateDoc(F.doc(f, T), { st:'done', champ:'bot-2' }));
  await wait(()=>document.querySelector('#tStage .tking'));
  ok(/Campeón/.test(await st()) && /Bot2/.test(await st()),'campeón: '+await st());
  await A.screenshot({path:__dirname+'/torneo2.png'});
  // varios torneos programados: una tarjeta por cada uno en la portada, con la hora y el lugar; en la sala se elige cuál ver
  await db(async f => {
    await F.updateDoc(F.doc(f, T), { place:'LABITCONF, Costa Salguero' });
    await F.setDoc(F.doc(f, 'tourneys/T2'), { name:'SEGUNDO GAMES', st:'open', cap:64, fee:0, lnurl:'', when:F.Timestamp.fromMillis(Date.now()+3*86400000), place:'Online', orgs:[], bases:'', lang:'es', cur:0,
      rounds:[{g:'sopa',lang:'es',s:'media',m:'w',dur:10}], champ:null, auto:true, at:F.Timestamp.now() });
  });
  await A.evaluate(()=>location.hash='');
  await wait(()=>document.querySelectorAll('#tBanner .tbanner').length===2);
  const cards=await A.$$eval('#tBanner .tbanner',l=>l.map(e=>e.textContent.replace(/\s+/g,' ')));
  ok(cards.some(c=>/SEGUNDO GAMES/.test(c) && /🗓/.test(c) && /📍 Online/.test(c)) && cards.some(c=>/PRUEBA GAMES/.test(c) && /📍 LABITCONF, Costa Salguero/.test(c)),'portada con los dos torneos, hora y lugar: '+cards.join(' | '));
  await A.$eval('#tBanner',e=>e.scrollIntoView()); await A.screenshot({path:__dirname+'/torneo-portada.png'});
  await A.click('#tBanner .tbanner[data-tid="T2"]');
  await wait(()=>location.hash==='#torneo' && /SEGUNDO GAMES/.test(document.querySelector('#tHead .tname')?.textContent||''));
  const head=await A.$eval('#tHead',e=>e.textContent.replace(/\s+/g,' '));
  ok(/📍 Online/.test(head) && /Arranca:/.test(head),'la sala del elegido, con hora y lugar: '+head.slice(0,200));
  ok(await A.$$eval('#tHead [data-tpick]',l=>l.length)===2,'en la sala se puede pasar al otro');
  await A.click('#tHead [data-tpick="T1"]');
  await wait(()=>/PRUEBA GAMES/.test(document.querySelector('#tHead .tname')?.textContent||''));
  ok(true,'cambia al otro torneo');
  // cierre de ronda (tDecided): pasan 2 de 4; la ronda se cierra apenas los que siguen jugando ya no pueden entrar
  const dec=await A.evaluate(()=>{
    const ts=ms=>({toMillis:()=>ms}), go=Date.now()-200000, at=s=>ts(go+s*1000);
    const fin=s=>({done:true, ok:true, e:0, h:0, c:0, s:0, f:0, p:1, at:at(s)});
    const rd={g:'sopa', k:'sopa', nr:0, pl:['a','b','c','me'], adv:2, final:false, go:ts(go), end:null};
    const r1={a:fin(50), b:fin(100), c:{done:false, p:0.3, e:0, h:0, c:0, at:at(60)}, me:{done:false, p:0.2, e:0, h:0, c:0, at:at(60)}};
    const own={...rd, own:'me'};
    return {
      // a los 70 s, el 2º sacó 900: c y la organizadora todavía pueden sacar hasta 932
      sin: tDecided(rd, r1, go+70000),
      // con la organizadora que pasa siempre queda 1 lugar: a ya lo tiene (950) y c no lo alcanza
      con: tDecided(own, r1, go+70000),
      // ...pero se espera a c mientras pueda superar a a
      conTemprano: tDecided(own, r1, go+51000),
      ownFinal: tOwn({...own, final:true}), ownFuera: tOwn({...own, pl:['a','b','c']})
    };
  });
  ok(dec.sin===false && dec.con===true && dec.conTemprano===false && dec.ownFinal===null && dec.ownFuera===null, 'cierre anticipado y organizadora que pasa: '+JSON.stringify(dec));
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
