const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async p=>(await fetch(FS+p,{headers:{Authorization:'Bearer owner'}})).json();
(async()=>{
  const br=await chromium.launch();
  // jugador: sugiere una palabra que ya está y una nueva
  const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message)); p.on('console',m=>/Sugerir/.test(m.text())&&console.log('console',m.text()));
  const txt=s=>p.$eval(s,e=>e.textContent.trim());
  await p.goto(URL); await p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  await p.click('#sugBox summary');
  ok(/¿Falta una palabra bitcoiner\?/.test(await txt('#sgTitle')),'recuadro: '+await txt('#sgTitle'));
  await p.fill('#sgWord','hodl'); await p.click('#sgSend'); await p.waitForTimeout(500);
  ok(/HODL ya está en los juegos/.test(await txt('#sgStatus')),'ya está: '+await txt('#sgStatus'));
  await p.fill('#sgWord','ab'); await p.click('#sgSend'); await p.waitForTimeout(300);
  ok(/solo letras/.test(await txt('#sgStatus')),'muy corta: '+await txt('#sgStatus'));
  await p.fill('#sgWord','Zapéar'); await p.fill('#sgDef','Mandar sats por Nostr'); await p.click('#sgSend');
  await p.waitForFunction(()=>/Gracias|No se pudo/.test(document.getElementById('sgStatus').textContent),null,{timeout:10000});
  ok(/ZAPEAR quedó sugerida/.test(await txt('#sgStatus')),'guardada: '+await txt('#sgStatus'));
  const docs=(await rest('sugs')).documents||[]; const f=docs[0]&&docs[0].fields;
  ok(docs.length===1 && f.w.stringValue==='ZAPEAR' && f.L.stringValue==='es' && f.d.stringValue==='Mandar sats por Nostr','en Firestore: '+JSON.stringify(f&&{w:f.w,L:f.L}));
  await p.click('#langBtn').catch(()=>{}); await p.waitForTimeout(300);

  // administración: base de datos falsa (las reglas reales se prueban en test.mjs)
  const a=await (await br.newContext({viewport:{width:1300,height:900}})).newPage(); a.on('pageerror',e=>console.log('admin pageerror',e.message));
  await a.addInitScript(()=>{
    const SG=[
      {id:'s1', w:'ZAPEAR', L:'es', d:'Mandar sats por Nostr', u:'u1', at:1},
      {id:'s2', w:'ZAPEAR', L:'es', u:'u2', at:2},
      {id:'s3', w:'HODL', L:'en', u:'u3', at:3},
      {id:'s4', w:'PLEBE', L:'es', u:'u1', at:4, st:'aprobada', ai:{es:'PLEBE', en:'PLEB', p:{es:['a','b','c'],en:['d','e','f']}, r:8, why:'muy usada'}},
      {id:'s5', w:'HOLDEAR', L:'es', u:'u1', at:5, ai:{es:'HOLDEAR', en:'HODL', p:{es:[],en:[]}, r:3, why:''}},
    ];
    window.__writes=[]; window.__clip='';
    try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{ window.__clip=t; }}}); }catch(e){}
    // un jugador nuevo hoy, que además armó su usuario hoy (para la solapa Jugadores → Por día)
    const NOW=Date.now(), DB={sugs:SG, names:[{id:'u9', name:'Lola', at:NOW-60000}], fichas:[{id:'u9', first:NOW-120000, last:NOW-60000}]};
    const snap=n=>({forEach:f=>(DB[n]||[]).forEach(x=>{ const {id,...d}=x; f({id, data:()=>d}); })});
    const A={ db:{}, collection:(db,n)=>n, collectionGroup:(db,n)=>n, getDocs:async n=>snap(n), doc:(db,c,id)=>c+'/'+id,
      setDoc:async(ref,d)=>{ window.__writes.push([ref,d]); }, deleteDoc:async()=>{}, serverTimestamp:()=>Date.now(),
      login:async()=>{}, logout:()=>{}, onState:cb=>setTimeout(()=>cb({email:'claudia@rodo.es'}),50) };
    let real=null;
    Object.defineProperty(window,'__adminResolve',{configurable:true, get:()=>real&&(x=>real(A)), set:v=>{ real=v; }});
  });
  await a.goto(URL+'#admin');
  await a.waitForFunction(()=>/Palabras sugeridas/.test(document.getElementById('admBody').textContent),null,{timeout:20000});
  ok((await a.$$eval('#admBody [data-admtab]',l=>l.map(b=>b.textContent).join('|'))).match(/^📈 Resumen\|👥 Jugadores\|🧩 Tienda\|💡 Sugeridas \(\d\)\|⚙️ Sistema$/),'solapas: '+await a.$$eval('#admBody [data-admtab]',l=>l.map(b=>b.textContent).join('|')));
  ok(/1\s*con usuario \(100\s*%\) · 0 sin usuario/.test(await a.$eval('#admBody .admsec[data-sec="res"]',e=>e.textContent)),'con y sin usuario: '+(await a.$eval('#admBody .admsec[data-sec="res"]',e=>e.textContent)).match(/\d+\s*con usuario[^·]*·[^<]{0,20}/));
  await a.click('[data-admtab="jug"]');
  const day=await a.$eval('#admBody .admsec[data-sec="jug"] .aday',e=>e.textContent.replace(/\s+/g,' '));
  ok(/1 nuevos · 1 usuarios nuevos/.test(day) && /Lola ✓/.test(day),'por día: '+day.slice(0,160));
  await a.click('[data-admtab="sug"]');   // el panel va en solapas
  const body=await a.$eval('#admBody',e=>e.innerText);
  const tbl=await a.$$eval('#admBody .sugst',s=>s.map(x=>x.dataset.k));
  ok(tbl.join()==='ZAPEAR,PLEBE','solo las que no están, nuevas primero: '+tbl.join());
  ok(/Ya estaban en el glosario \(no se muestran\): HODL, HOLDEAR/.test(body),'ocultas las del glosario, también por traducción');
  ok(/2 personas/.test(body) && /8\/10/.test(body) && /PLEB/.test(body),'agrupa y muestra análisis');
  await a.click('#sgCopy'); await a.waitForTimeout(200);
  const clip=await a.evaluate(()=>window.__clip);
  ok(/"id": "ZAPEAR"/.test(clip) && !/"id": "PLEBE"/.test(clip) && /Mandar sats por Nostr/.test(clip) && /SATS →/.test(clip),'pedido para Claude con las que faltan');
  await a.click('#sgAppr'); await a.waitForTimeout(200);
  const ap=await a.evaluate(()=>window.__clip);
  ok(/- PLEBE \/ PLEB/.test(ap) && /Pistas EN: d \| e \| f/.test(ap),'aprobadas para el glosario');
  await a.click('#admBody details:has(#sgAi) summary');
  await a.fill('#sgAi','```json\n[{"id":"ZAPEAR","es":"ZAPEAR","en":"ZAPPING","p":{"es":["x","y","z"],"en":["q","r","s"]},"r":7,"why":"jerga"},{"id":"NOPE"}]\n```');
  await a.click('#sgAiSave'); await a.waitForTimeout(400);
  const w=await a.evaluate(()=>window.__writes);
  ok(w.length===2 && w.every(([r,d])=>/^sugs\/s[12]$/.test(r) && d.ai.r===7 && d.ai.en==='ZAPPING' && d.ai.p.es.length===3),'guarda el análisis en las dos sugerencias: '+JSON.stringify(w.map(x=>x[0])));
  ok(/Guardadas 1\. No encontré: NOPE/.test(await a.$eval('#sgAiMsg',e=>e.textContent)),'avisa las que no encontró');
  await a.selectOption('#admBody .sugst[data-k="ZAPEAR"]','descartada'); await a.waitForTimeout(300);
  const w2=(await a.evaluate(()=>window.__writes)).slice(2);
  ok(w2.length===2 && w2.every(([,d])=>d.st==='descartada'),'cambia el estado de todo el grupo');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
