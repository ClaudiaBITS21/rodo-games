// Torneo por mesas: el panel agrega mesas, habilita la entrada y arranca; los jugadores entran por el QR de su mesa,
// el capitán juega y el resto ve el tablero en vivo, el teclado pasa a otro sin perder nada, resultados, podio y pantalla de sala
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const db = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  const get = async p => { let v=null; await db(async f => { const s=await F.getDoc(F.doc(f, p)); v=s.exists() ? s.data() : null; }); return v; };
  const all = async p => { let v={}; await db(async f => { (await F.getDocs(F.collection(f, p))).forEach(d=>v[d.id]=d.data()); }); return v; };
  const until = async (fn, ms=25000) => { const t=Date.now(); while(Date.now()-t<ms){ const v=await fn(); if(v) return v; await new Promise(r=>setTimeout(r,400)); } return null; };
  const T='tourneys/M1';
  await db(f => F.setDoc(F.doc(f, T), { name:'MESAS DE PRUEBA', mode:'mesas', st:'draft', cap:64, fee:0, lnurl:'', when:null, orgs:[], bases:'', lang:'es', cur:0,
    rounds:[{g:'ahorcado',lang:'es',n:2,dur:15},{g:'criptograma',lang:'es',dur:15}], champ:null, go:null, at:F.Timestamp.now() }));
  const br=await chromium.launch();
  const page=async(n,w=390)=>{ const p=await (await br.newContext({viewport:{width:w,height:844}})).newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  // panel: agregar 2 mesas y habilitar la entrada
  const a=await page('admin',1300);
  await a.addInitScript(()=>{ window.__admTok=JSON.stringify({sub:'adm1', email:'claudia@rodo.es', email_verified:true}); });
  await a.goto(URL+'#torneo-admin'); await a.click('#taIn');
  await a.waitForSelector('[data-ta="madd"]',{timeout:20000});
  ok(/Entrada cerrada/.test(await a.$eval('#taCtl',e=>e.textContent)) && /Partidas/.test(await a.$eval('#taCfg',e=>e.textContent)),'el panel muestra el torneo por mesas');
  await a.fill('#taMesaN','2'); await a.click('[data-ta="madd"]');
  const gs=await until(async()=>{ const x=await all(`${T}/groups`); return Object.keys(x).length===2 && x; });
  ok(!!gs,'se agregan 2 mesas');
  const [g1,g2]=Object.entries(gs).sort((x,y)=>x[1].i-y[1].i).map(([k])=>k);
  ok(gs[g1].nm==='Mesa 1' && gs[g2].nm==='Mesa 2','con nombre por defecto: '+gs[g1].nm+', '+gs[g2].nm);
  await a.waitForSelector(`.madm[data-g="${g1}"] [data-mg="nm"]`);
  await a.fill(`.madm[data-g="${g1}"] [data-mg="nm"]`,'Los Plebs'); await a.fill(`.madm[data-g="${g1}"] [data-mg="em"]`,'🍀'); await a.click(`.madm[data-g="${g1}"] [data-ta="mren"]`);
  ok(!!(await until(async()=>{ const x=await get(`${T}/groups/${g1}`); return x.nm==='Los Plebs' && x.em==='🍀'; })),'nombre y emoji de la mesa');
  // QR de las mesas para imprimir
  const [qp]=await Promise.all([a.context().waitForEvent('page'), a.click('[data-ta="mqr"]')]);
  await qp.waitForSelector('.c svg',{timeout:15000}).catch(()=>{});
  ok(await qp.$$eval('.c svg',l=>l.length)===2 && /mesa=M1~/.test(await qp.$eval('body',e=>e.textContent)),'una hoja con el QR de cada mesa');
  await qp.close();
  // sin entrada habilitada, el QR dice que espera
  const A=await page('A'), B=await page('B'), C=await page('C');
  // apenas se abre el link del QR, antes de que cargue nada, ya dice «Cargando»
  const L0=await page('L0'); await L0.route(/\/(fb|__\/firebase)\//, r=>new Promise(res=>setTimeout(()=>res(r.continue()),4000))).catch(()=>{});
  await L0.goto(URL+`?mesa=M1~${g1}`, {waitUntil:'domcontentloaded'});
  ok(/Cargando/.test(await L0.$eval('#mesaBody',e=>e.textContent)) && await L0.evaluate(()=>location.hash)==='#mesa','al abrir el QR, lo primero que se ve es «Cargando tu mesa…»');
  await L0.close();
  const L1=await page('L1'); await L1.route(/\/(fb|__\/firebase)\//, r=>new Promise(res=>setTimeout(()=>res(r.continue()),4000))).catch(()=>{});
  await L1.goto(URL+'?t=OTRO', {waitUntil:'commit'}); await L1.waitForSelector('#tHead .loading, #tHead .intro',{timeout:5000}).catch(()=>{});
  { const th=await L1.$eval('#tHead',e=>e.textContent), vt=await L1.$eval('#view-torneo',e=>e.textContent); ok(/Cargando/.test(th) && !/Sin conexión/.test(vt),'el QR del torneo también: «Cargando…», no «Sin conexión»: '+th.slice(0,80)); }
  await L1.close();
  await A.goto(URL+`?mesa=M1~${g1}`);
  await A.waitForFunction(()=>/Esperando que abra la mesa/.test(document.getElementById('mesaBody').textContent),null,{timeout:20000}).catch(()=>{});
  ok(/Esperando que abra la mesa/.test(await A.$eval('#mesaBody',e=>e.textContent)) && await A.evaluate(()=>location.hash)==='#mesa','sin entrada habilitada: «Esperando que abra la mesa»');
  await a.click('[data-ta="mopen"]');
  await A.waitForSelector('#mName',{timeout:15000});
  ok(/mismo navegador/.test(await A.$eval('#mesaBody',e=>e.textContent)),'aviso de usar el mismo navegador');
  // QR de una mesa que ya no existe: lo dice y queda anotado para la organización
  const X=await page('X'); await X.goto(URL+'?mesa=M1~noexiste');
  await X.waitForFunction(()=>/ya no existe/.test(document.getElementById('mesaBody').textContent),null,{timeout:20000}).catch(()=>{});
  ok(/pedí el QR actualizado/.test(await X.$eval('#mesaBody',e=>e.textContent)),'QR de una mesa borrada: «Esta mesa ya no existe…»');
  ok(!!(await until(async()=>{ const e=await all('errs'); return Object.values(e).some(x=>x.w==='mesa-mesa'); },10000)),'y queda en «Errores recientes»');
  const enter=async(p,name,emo)=>{ await p.fill('#mName',name); if(emo) await p.click(`#mEmo [data-e="${emo}"]`); await p.click('[data-mesa="join"]'); await p.waitForSelector('.mpls',{timeout:15000}); };
  await enter(A,'Ana','🦊');
  await B.goto(URL+`?mesa=M1~${g1}`); await B.waitForSelector('#mName',{timeout:20000}); await enter(B,'Beto');
  await C.goto(URL+`?mesa=M1~${g2}`); await C.waitForSelector('#mName',{timeout:20000}); await enter(C,'Caro','🚀');
  const ua=await A.evaluate(()=>Reg.uid()), ub=await B.evaluate(()=>Reg.uid());
  const G1=await until(async()=>{ const x=await get(`${T}/groups/${g1}`); return Object.keys(x.mem||{}).length===2 && x; });
  ok(G1 && G1.cap===null && G1.mem[ua].e==='🦊' && !G1.mem[ub].e && G1.mem[ua].t<=G1.mem[ub].t,'nombre y emoji sin usuario; nadie queda de capitán solo');
  await A.waitForFunction(()=>/lo elige la organización/.test(document.getElementById('mesaBody').textContent),null,{timeout:10000}).catch(()=>{});
  ok(/lo elige la organización/.test(await A.$eval('#mesaBody',e=>e.textContent)),'la mesa ve que el capitán lo elige la organización');
  await a.waitForFunction(g=>/2<\/b> jugadores/.test(document.querySelector(`.madm[data-g="${g}"]`).innerHTML) && /sin capitán/.test(document.querySelector(`.madm[data-g="${g}"]`).textContent),g1,{timeout:10000}).catch(()=>{});
  ok(/👥 2 jugadores/.test(await a.$eval(`.madm[data-g="${g1}"]`,e=>e.textContent)) && /sin capitán/.test(await a.$eval(`.madm[data-g="${g1}"]`,e=>e.textContent)),'el panel muestra cuántos hay en la mesa y que falta capitán');
  await a.selectOption(`[data-ta="mcap"][data-g="${g1}"]`, ua);
  ok(!!(await until(async()=>(await get(`${T}/groups/${g1}`)).cap===ua)),'la organización elige el capitán');
  await A.waitForFunction(()=>/Beto/.test(document.getElementById('mesaBody').textContent),null,{timeout:10000}).catch(()=>{});
  await A.waitForFunction(()=>/👑/.test(document.getElementById('mesaBody').textContent),null,{timeout:10000}).catch(()=>{});
  ok(/👑/.test(await A.$eval('#mesaBody',e=>e.textContent)) && /Beto/.test(await A.$eval('#mesaBody',e=>e.textContent)),'el lobby muestra quiénes entraron y el capitán');
  // el capitán pasa el teclado tocando un nombre, y el panel lo devuelve
  await A.click(`.mpls [data-u="${ub}"]`); await A.click(`.mpls [data-u="${ub}"]`);
  ok(!!(await until(async()=>(await get(`${T}/groups/${g1}`)).cap===ub)),'el capitán le pasa el teclado a otro tocando su nombre');
  await a.waitForSelector(`[data-ta="mcap"][data-g="${g1}"]`,{timeout:10000}); await a.selectOption(`[data-ta="mcap"][data-g="${g1}"]`, ua);
  ok(!!(await until(async()=>(await get(`${T}/groups/${g1}`)).cap===ua)),'el panel reasigna el capitán');
  // arrancar: cuenta regresiva y todos a la vez
  await a.click('[data-ta="mstart"]'); await a.click('[data-ta="mstart"]');
  const tr=await until(async()=>{ const x=await get(T); return x.st==='live' && x.go && x; });
  const pz=await all(`${T}/mpz`);
  const uc=await C.evaluate(()=>Reg.uid());
  ok((await get(`${T}/groups/${g2}`)).cap===uc,'al arrancar, la mesa sin capitán elegido queda con el primero que entró');
  ok(tr && Object.keys(pz).length===2 && pz['0'].g==='ahorcado' && pz['1'].g==='criptograma','arranca: se generan las partidas en orden');
  await A.waitForFunction(()=>/Arranca en/.test(document.getElementById('mesaBody').textContent),null,{timeout:10000}).catch(()=>{});
  ok(/Arranca en/.test(await A.$eval('#mesaBody',e=>e.textContent)),'cuenta regresiva en la mesa');
  for(const p of [A,B,C]) await p.waitForFunction(()=>location.hash==='#ahorcado' && !document.getElementById('mesaTop').hidden,null,{timeout:30000});
  ok(true,'las tres pantallas entran solas a la primera partida');
  await a.waitForFunction(g=>/Partida 1 de 2 · Ahorcado · ⏱ quedan 1[45]:\d\d/.test(document.querySelector(`.madm[data-g="${g}"]`).textContent),g1,{timeout:15000}).catch(()=>{});
  ok(/Partida 1 de 2 · Ahorcado · ⏱ quedan 1[45]:\d\d/.test(await a.$eval(`.madm[data-g="${g1}"]`,e=>e.textContent)),'el panel muestra en qué partida está cada mesa y cuánto le queda: '+(await a.$eval(`.madm[data-g="${g1}"] .mnow`,e=>e.textContent).catch(()=>'-')));
  ok(/Tenés el teclado/.test(await A.$eval('#mesaTop',e=>e.textContent)) && /Mirando cómo juega 🦊 Ana/.test(await B.$eval('#mesaTop',e=>e.textContent)),'arriba: quién tiene el teclado');
  ok(/Los Plebs/.test(await B.$eval('#mesaTop',e=>e.textContent)) && /Partida 1 de 2/.test(await B.$eval('#mesaTop',e=>e.textContent)),'arriba: mesa y partida');
  ok(await B.evaluate(()=>document.body.classList.contains('mesaro')) && await B.$eval('#hKeys',e=>e.closest('[inert]')!==null || e.inert),'quien mira no puede tocar el tablero');
  // el capitán juega y la mesa lo ve en vivo
  const W=pz['0'].d.list.map(o=>o.w);
  const letters=[...new Set(W[0])];
  await A.click(`#hKeys .key[data-k="${letters[0]}"]`);
  await B.waitForFunction(ch=>[...document.querySelectorAll('#hWord .hl')].some(e=>e.textContent===ch),letters[0],{timeout:10000}).catch(()=>{});
  ok(await B.evaluate(ch=>[...document.querySelectorAll('#hWord .hl')].some(e=>e.textContent===ch),letters[0]),'la mesa ve la letra del capitán en vivo');
  const wrong=[...'ZXQWJKV'].find(ch=>!W[0].includes(ch));
  await A.click(`#hKeys .key[data-k="${wrong}"]`);
  await B.waitForFunction(()=>/te quedan 5|5 bloques|5/.test(document.getElementById('hLives').textContent),null,{timeout:10000}).catch(()=>{});
  ok(await B.$eval('#hLives',e=>e.textContent)===await A.$eval('#hLives',e=>e.textContent),'y los errores (bloques): '+await B.$eval('#hLives',e=>e.textContent));
  await a.waitForFunction(g=>/0\/2 palabras · 1 error/.test(document.querySelector(`.madm[data-g="${g}"] .mnow`).textContent),g1,{timeout:15000}).catch(()=>{});
  ok(/0\/2 palabras · 1 error/.test(await a.$eval(`.madm[data-g="${g1}"] .mnow`,e=>e.textContent)),'y el avance en vivo: '+(await a.$eval(`.madm[data-g="${g1}"] .mnow`,e=>e.textContent).catch(()=>'-')));
  // Beto pide el teclado; Ana se lo da y él sigue desde ahí
  await B.click('[data-mesa="take"]');
  await A.waitForSelector('[data-mesa="give"]',{timeout:10000});
  ok(/Beto pide el teclado/.test(await A.$eval('#mesaTop',e=>e.textContent)),'el capitán ve el pedido');
  await A.click('[data-mesa="give"]');
  await B.waitForFunction(()=>/Tenés el teclado/.test(document.getElementById('mesaTop').textContent) && !document.body.classList.contains('mesaro'),null,{timeout:15000});
  ok(await B.evaluate(ch=>[...document.querySelectorAll('#hWord .hl')].some(e=>e.textContent===ch),letters[0]) && await B.evaluate(()=>Reg.cur('ahorcado').e)===1,'el nuevo capitán sigue desde el estado guardado (letras y errores)');
  ok(await A.evaluate(()=>document.body.classList.contains('mesaro')),'y el anterior pasa a mirar');
  // recargar la página en medio de la partida no resetea nada: vuelve a la mesa con el mismo tablero
  await B.reload();
  await B.waitForFunction(()=>location.hash==='#ahorcado' && /Tenés el teclado/.test(document.getElementById('mesaTop').textContent),null,{timeout:30000}).catch(()=>{});
  ok(await B.evaluate(ch=>[...document.querySelectorAll('#hWord .hl')].some(e=>e.textContent===ch),letters[0]) && await B.evaluate(()=>Reg.cur('ahorcado').e)===1,'el capitán recarga la página y sigue con el mismo tablero y los mismos errores');
  await a.waitForSelector('.mboard',{timeout:10000}).catch(()=>{});
  const brd=await a.$eval('.mboard',e=>e.textContent.replace(/\s+/g,' ')).catch(()=>'');
  ok(/Los Plebs/.test(brd) && /▶/.test(brd) && /Ahorcado/.test(brd),'tabla en vivo en el panel: '+brd.slice(0,140));
  for(const ch of letters.slice(1)) await B.click(`#hKeys .key[data-k="${ch}"]`);
  await B.waitForTimeout(1200);
  for(const ch of [...new Set(W[1])]){ await B.waitForSelector(`#hKeys .key[data-k="${ch}"]:not([disabled])`,{timeout:5000}).catch(()=>{}); await B.click(`#hKeys .key[data-k="${ch}"]`).catch(()=>{}); }
  const r0=await until(async()=>{ const x=await get(`${T}/groups/${g1}`); return x.res && x.res['0'] && x.res['0']; });
  ok(r0 && r0.ok && r0.s===2 && r0.R===2 && r0.e===1,'partida resuelta: resultado anotado '+JSON.stringify(r0&&{ok:r0.ok,s:r0.s,e:r0.e}));
  // la mesa pasa sola a la siguiente; el capitán se rinde
  for(const p of [A,B]) await p.waitForFunction(()=>location.hash==='#criptograma',null,{timeout:20000});
  ok(true,'la mesa pasa sola a la siguiente partida');
  await B.waitForFunction(()=>!document.body.classList.contains('mesaro'),null,{timeout:5000}).catch(()=>{});
  await B.click('#cGiveUp'); await B.click('#cGiveUp');
  const r1=await until(async()=>{ const x=await get(`${T}/groups/${g1}`); return x.res && x.res['1'] && x.res['1']; });
  ok(r1 && r1.ok===false,'sin resolver: 0 puntos');
  // los resultados no se pueden cambiar
  const tampered=await B.evaluate(async([g])=>{ const fb=Reg.fb(); try{ await fb.updateDoc(fb.doc(fb.db,"tourneys","M1","groups",g),{"res.1":{ok:true,t0:fb.serverTimestamp(),at:fb.serverTimestamp(),e:0,h:0,s:0,R:0}}); return "ok"; }catch(e){ return e.code||"err"; } },[g1]);
  ok(tampered!=="ok",'los resultados anotados no se cambian: '+tampered);
  // la mesa terminó: espera a las demás; la tabla entre mesas está arriba
  await A.waitForFunction(()=>location.hash==='#mesa',null,{timeout:15000}).catch(()=>{});
  ok(/terminó todas las partidas/.test(await A.$eval('#mesaBody',e=>e.textContent)),'la mesa terminó y espera a las demás');
  // la otra mesa no juega: el panel la cierra por tiempo? (no: sin capitán no hay partida empezada). Se termina el torneo desde el panel
  const S=await page('sala',1280); await S.goto(URL+'?pantalla=M1');
  await S.waitForFunction(()=>/Los Plebs/.test(document.getElementById('mesaSala').textContent),null,{timeout:20000}).catch(()=>{});
  ok(await S.evaluate(()=>location.hash)==='#mesa-sala' && /Los Plebs/.test(await S.$eval('#mesaSala',e=>e.textContent)) && /Mesa 2/.test(await S.$eval('#mesaSala',e=>e.textContent)),'pantalla de sala con la tabla entre mesas');
  const pts=await S.$$eval('#mesaSala .mtab tbody tr',l=>l.map(r=>r.textContent));
  ok(await S.$$eval('#mesaSala .mtab tbody tr',l=>l.map(r=>r.children[2].textContent).join(','))==='2,1','la tabla dice cuántos hay en cada mesa');
  ok(/Los Plebs/.test(pts[0]),'la mesa con más puntos va primera: '+pts.join(' | '));
  await a.click('[data-ta="mdone"]'); await a.click('[data-ta="mdone"]');
  await S.waitForFunction(()=>/Terminó el torneo/.test(document.getElementById('mesaSala').textContent),null,{timeout:15000}).catch(()=>{});
  ok(/🥇/.test(await S.$eval('#mesaSala',e=>e.textContent)),'podio al final en la pantalla de sala');
  await S.screenshot({path:__dirname+'/mesas-sala.png'});
  await A.waitForFunction(()=>/Terminó el torneo/.test(document.getElementById('mesaBody').textContent),null,{timeout:15000}).catch(()=>{});
  ok(/Guardá tu resultado/.test(await A.$eval('#mesaBody',e=>e.textContent)),'al final: «Guardá tu resultado: creá tu usuario»');
  await A.click('[data-mesa="user"]'); await A.waitForSelector('#userDlg[open]',{timeout:5000}).catch(()=>{});
  ok(!!(await A.$('#userDlg[open]')),'abre crear usuario (vincula el jugador anónimo)');
  await br.close(); await env.cleanup();
  console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
