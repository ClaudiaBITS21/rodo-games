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
  await A.goto(URL); await B.goto(URL);
  await A.waitForFunction(()=>/^1 /.test(document.getElementById('liveN').textContent),null,{timeout:40000});
  // A invita a B al ahorcado
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="ahorcado"]'); await A.click('#ivSend'); await mkUser(A,'Ana'); await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000}); await B.click('#ivYes');
  await A.waitForFunction(()=>location.hash==='#ahorcado'); await B.waitForFunction(()=>location.hash==='#ahorcado');
  const n=await pidOf(A,'ahorcado'); ok(n===await pidOf(B,'ahorcado'),'misma partida #'+n);
  const pz=await rest(`puzzles/ahorcado6-es-${n}`); const LIST=pz.fields.data.mapValue.fields.list.arrayValue.values.map(v=>v.mapValue.fields.w.stringValue); const word=LIST[0];
  console.log('     palabra:', word);
  const all=[...'QWERTYUIOPASDFGHJKLÑZXCVBNM'], wrongs=all.filter(c=>!word.includes(c)).slice(0,3), rights=[...new Set(word)].filter(c=>all.includes(c));
  await A.waitForFunction(()=>!document.getElementById('view-ahorcado').classList.contains('locked'),null,{timeout:12000});
  await B.waitForFunction(()=>!document.getElementById('view-ahorcado').classList.contains('locked'),null,{timeout:12000});
  const press=async(p,c)=>{ await p.click(`#hKeys button[data-k="${c}"]`); await p.waitForTimeout(80); };
  for(const w of LIST){ for(const c of [...new Set(w)].filter(c=>all.includes(c))) await press(A,c); await A.waitForTimeout(900); }
  await B.waitForFunction(()=>/ya ganó esta/.test(document.querySelector('#view-ahorcado .pduel').textContent),null,{timeout:15000});
  ok(true,'B: '+await txt(B,'#view-ahorcado .pduel'));
  await A.waitForFunction(()=>/Ganaste esta! .* ya no te alcanza/.test((document.querySelector('#view-ahorcado .wduel')||{}).textContent||''),null,{timeout:15000});
  ok(true,'A: '+await txt(A,'#view-ahorcado .wduel .dunow'));
  // English
  await B.evaluate(()=>document.querySelector('[data-lang="en"],#langBtn')&&0);
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
