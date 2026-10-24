const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async(path,opt={})=>{ const r=await fetch(FS+path,{...opt,headers:{Authorization:'Bearer owner','content-type':'application/json'}}); return r.json(); };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext()).newPage(); p.on('dialog',d=>{ console.log('DIALOG '+d.message()); d.accept(); });
    p.on('pageerror',e=>console.log(n,'pageerror',e.message));
    p.on('console',m=>{ if(m.type()==='error') console.log(n,'console',m.text().slice(0,160)); }); return p; };
  const A=await mk('A'), B=await mk('B');
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const mkUser=async(p,name,pin='123456')=>{ await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin',pin); await p.fill('#uPin2',pin); await p.click('#uGo'); await p.waitForTimeout(1200); };

  const pidOf=async(p,g)=>{ await p.waitForFunction(g=>/\d/.test(document.querySelector(`#view-${g} .pid`).textContent),g,{timeout:20000}); return (await txt(p,`#view-${g} .pid`)).match(/\d+/)[0]; };
  await A.goto(URL); await B.goto(URL+'#sopa');
  // B empieza una sopa (va a quedar congelada)
  await pidOf(B,'sopa'); await B.click('#view-sopa .gatecard button'); await B.waitForTimeout(1500);
  await A.waitForFunction(()=>/^1 /.test(document.getElementById('liveN').textContent),null,{timeout:40000});
  // A invita a B al ahorcado
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="ahorcado"]'); await A.click('#ivSend'); await mkUser(A,'Ana'); await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000}); await B.click('#ivYes');
  // «Invitar a jugar» abre la sala de Ana: arranca cuando ella quiere
  await A.waitForFunction(()=>document.getElementById('salaDlg').open && /2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:15000});
  await A.click('#salaGo');
  await A.waitForFunction(()=>location.hash==='#ahorcado'); await B.waitForFunction(()=>location.hash==='#ahorcado');
  const n=await pidOf(A,'ahorcado'); ok(n===await pidOf(B,'ahorcado'),'misma partida #'+n);
  const pz=await rest(`puzzles/ahorcado6-es-${n}`); const LIST=pz.fields.data.mapValue.fields.list.arrayValue.values.map(v=>v.mapValue.fields.w.stringValue); const word=LIST[0];
  console.log('     palabra:', word);
  const all=[...'QWERTYUIOPASDFGHJKLÑZXCVBNM'], wrongs=all.filter(c=>!word.includes(c)).slice(0,3), rights=[...new Set(word)].filter(c=>all.includes(c));
  // arranque simultáneo: cuenta regresiva, sin botón Iniciar
  ok(/Empieza en \d/.test(await txt(A,'#view-ahorcado .gatecard button')),'cuenta regresiva: '+await txt(A,'#view-ahorcado .gatecard button'));
  await A.waitForFunction(()=>!document.getElementById('view-ahorcado').classList.contains('locked'),null,{timeout:12000});
  await B.waitForFunction(()=>!document.getElementById('view-ahorcado').classList.contains('locked'),null,{timeout:12000});
  const t0a=await A.evaluate(()=>Reg.cur('ahorcado').t0), t0b=await B.evaluate(()=>Reg.cur('ahorcado').t0);
  ok(Math.abs(t0a-t0b)<1500,`arrancan juntos (diferencia ${Math.abs(t0a-t0b)} ms)`);
  ok(/Juegan 2 a la vez/.test(await txt(A,'#view-ahorcado .pduel')),'A ve: '+await txt(A,'#view-ahorcado .pduel'));
  const press=async(p,c)=>{ await p.click(`#hKeys button[data-k="${c}"]`); await p.waitForTimeout(120); };
  for(const c of wrongs) await press(A,c);
  const pen=await txt(A,'#view-ahorcado .ppen'); ok(pen==='+20 s','aviso de penalidad del ahorcado: '+pen);
  const tA=await txt(A,'#view-ahorcado .ptime'); ok(/1:0\d/.test(tA),'el reloj de A sumó 60 s: '+tA);
  ok(!(await A.$eval('#hClueBtn',b=>b.disabled)),'en duelo la pista está disponible desde el principio');
  ok(!/7 minutos/.test(await txt(A,'#view-ahorcado .pcost')),'línea de costos sin bloqueo: '+await txt(A,'#view-ahorcado .pcost'));
  for(const c of rights) await press(A,c);
  await A.waitForTimeout(900); await A.click('#hEnd'); await A.click('#hEnd');
  await B.waitForFunction(()=>/ya terminaron/.test(document.querySelector('#view-ahorcado .pduel').textContent),null,{timeout:10000});
  ok(true,'B ve en vivo: '+await txt(B,'#view-ahorcado .pduel'));
  ok(/Para quedar primero tenés que terminar en menos de \d+:\d\d/.test(await txt(B,'#view-ahorcado .pduel')),'B sabe cuánto le queda para ganarle');
  await A.waitForFunction(()=>/todavía puede ganarte si termina en menos de/.test((document.querySelector('#view-ahorcado .wsala .sastat')||{}).textContent||''),null,{timeout:10000});
  ok(true,'A: '+(await txt(A,'#view-ahorcado .wsala .sastat')));
  for(const c of rights) await press(B,c);
  await B.waitForTimeout(900); await B.click('#hEnd'); await B.click('#hEnd');
  await A.waitForSelector('#view-ahorcado .wpts',{timeout:10000}); await B.waitForSelector('#view-ahorcado .wpts',{timeout:10000});
  const pa=await txt(A,'#view-ahorcado .wpts'), pb=await txt(B,'#view-ahorcado .wpts');
  ok(/puntos/.test(pa) && /errores y ayudas/.test(pa),'A: '+pa); ok(/puntos/.test(pb),'B: '+pb);
  const na=+pa.match(/\d+/)[0], nb=+pb.match(/\d+/)[0]; ok(nb-na>=55 && nb-na<=65,`diferencia por 3 errores ≈ 60 (${nb} − ${na})`);
  // la sala: quién ganó y «Otra ronda» para Ana
  await B.waitForFunction(()=>/Ganaste esta/.test((document.querySelector('#view-ahorcado .wsala .sastat')||{}).textContent||''),null,{timeout:15000});
  ok(true,'B: '+await txt(B,'#view-ahorcado .wsala .sastat'));
  await A.waitForFunction(()=>/Ganó/.test((document.querySelector('#view-ahorcado .wsala .sastat')||{}).textContent||''),null,{timeout:15000});
  ok(!(await A.isVisible('#hAgain')) && !(await B.isVisible('#hAgain')) && await A.isVisible('#view-ahorcado .saAgain'),'en la sala no está "Otra palabra"; Ana tiene «Otra ronda»');
  // aprendió algo
  await B.waitForTimeout(1500);
  await B.click('#view-ahorcado .lchips button'); await B.waitForTimeout(1500);
  ok(/Sumaste 1 palabra/.test(await txt(B,'#view-ahorcado .wlearn')),'tilde aprendizaje: '+await txt(B,'#view-ahorcado .wlearn'));
  const le=await rest('learned'); ok(le.documents && le.documents[0].fields.yes.booleanValue===true && le.documents[0].fields.n,'aprendizaje guardado');
  ok(/Sopa de letras quedó en pausa/.test(await txt(B,'#view-ahorcado .wback')),'B: pregunta retomar: '+await txt(B,'#view-ahorcado .wback'));
  // B invita a Ana a su propia sala; primero prueba un apodo ocupado
  await B.evaluate(()=>location.hash=''); await B.waitForTimeout(600);
  await B.click('#ivBtn'); await B.waitForSelector('#ivOut[open]');
  await B.click('#ivGames button[data-g="criptograma"]'); await B.click('#ivSend'); await mkUser(B,'ANA');
  ok(/ya lo usa otra persona/.test(await txt(B,'#uMsg')),'apodo ocupado: '+await txt(B,'#uMsg'));
  await B.fill('#uName','Beto'); await B.click('#uGo'); await B.waitForTimeout(1500); await B.click('#ivSend');
  await A.waitForSelector('#ivIn[open]',{timeout:15000});
  ok(/Beto te invita a su sala: Criptograma/.test(await txt(A,'#ivInT')),'A recibe: '+await txt(A,'#ivInT'));
  await A.click('#ivYes');
  await B.waitForFunction(()=>document.getElementById('salaDlg').open && /2 en la sala/.test(document.getElementById('salaWho').textContent),null,{timeout:15000});
  await B.click('#salaGo');
  await A.waitForFunction(()=>location.hash==='#criptograma'); await B.waitForFunction(()=>location.hash==='#criptograma');
  const n2=await pidOf(A,'criptograma'); ok(n2===await pidOf(B,'criptograma'),'la sala de Beto, misma partida #'+n2);
  await B.waitForTimeout(1500);
  const buid=await B.evaluate(()=>Reg.uid()), p0=await A.evaluate(()=>Reg.uid());
  const sb=await rest(`salas/${buid}`); const games=sb.fields.games.arrayValue.values.map(v=>v.stringValue);
  ok(games[games.length-1]===`criptograma-es-${n2}`,'sala guardada: '+games.join(', '));
  // estadísticas de A: el duelo y sus partidas
  await A.evaluate(()=>location.hash='stats'); await A.waitForFunction(()=>/Competencias/.test(document.getElementById('stBody').textContent),null,{timeout:20000});
  const st=await A.$eval('#stBody',e=>e.innerText.replace(/\s+/g,' '));
  ok(/1 partidas terminadas/.test(st) && /Ahorcado/.test(st),'stats A: '+st.slice(0,260));
  ok(/Ana/.test(await txt(A,'#stHead')),'encabezado con usuario: '+await txt(A,'#stHead'));
  await A.evaluate(()=>location.hash='');
  // B vuelve a la sopa: sigue desde donde quedó
  await B.evaluate(()=>location.hash='sopa'); await B.waitForTimeout(1200);
  ok(!/frozen/.test(await B.$eval('#view-sopa .ptime',e=>e.className)),'sopa descongelada al volver: '+await txt(B,'#view-sopa .ptime'));
  // apodo cargado del servidor aunque se borre el navegador
  await A.evaluate(()=>localStorage.removeItem('rodo-nick')); await A.goto(URL); await A.waitForTimeout(3000);
  await A.click('#ivBtn'); ok(!(await A.isVisible('#ivNickRow')),'A conserva su apodo desde el servidor'); await A.click('#ivOutX');
  // modo prueba
  const auid=p0; await rest(`testers?documentId=${auid}`,{method:'POST',body:JSON.stringify({fields:{at:{timestampValue:new Date().toISOString()}}})});
  await A.goto(URL); await A.waitForTimeout(3000);
  ok(await A.isVisible('.testbadge'),'cartel PRUEBA visible');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
