const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async(path,opt={})=>{ const r=await fetch(FS+path,{...opt,headers:{Authorization:'Bearer owner','content-type':'application/json'}}); return r.json(); };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext()).newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  const A=await mk('A'), B=await mk('B'), C=await mk('C');
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined' && Reg.uid && Reg.uid(),null,{timeout:20000});
  await A.goto(URL); await ready(A);
  ok(/Elegí tu usuario/.test(await txt(A,'#userBtn')),'botón arriba: '+await txt(A,'#userBtn'));
  // crear usuario
  await A.click('#userBtn'); await A.waitForSelector('#userDlg[open]');
  await A.fill('#uName','Rodo'); await A.click('#uAvs button[data-a="🦉"]'); await A.fill('#uPin','12345'); await A.fill('#uPin2','12345'); await A.click('#uGo');
  ok(/6 números/.test(await txt(A,'#uMsg')),'PIN corto: '+await txt(A,'#uMsg'));
  await A.fill('#uPin','123456'); await A.fill('#uPin2','123457'); await A.click('#uGo');
  ok(/no coinciden/.test(await txt(A,'#uMsg')),'PIN distinto: '+await txt(A,'#uMsg'));
  await A.fill('#uPin2','123456'); await A.click('#uGo'); await A.waitForTimeout(1500);
  ok(/🦉 Rodo/.test(await txt(A,'#userBtn')),'usuario creado: '+await txt(A,'#userBtn'));
  const uidA=await A.evaluate(()=>Reg.uid());
  // pistas: abrir un ahorcado registra las pistas vistas y su uso general
  await A.evaluate(()=>location.hash='ahorcado'); await A.waitForFunction(()=>/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000}); await A.waitForTimeout(1500);
  const fi=await rest(`fichas/${uidA}`); const cl=fi.fields.cl&&fi.fields.cl.mapValue.fields.es.arrayValue.values.map(v=>v.stringValue);
  ok(cl && cl.length===6 && cl.every(x=>/^\d+\.[123]$/.test(x)),'pista vista con código: '+(cl||[]).join(','));
  const cu=await rest('clueuse/es'); ok(cu.fields && Object.keys(cu.fields).length===6,'uso general: '+JSON.stringify(cu.fields));
  // otro dispositivo: apodo ocupado
  await C.goto(URL); await ready(C); await C.click('#userBtn'); await C.fill('#uName','RODO'); await C.fill('#uPin','111111'); await C.fill('#uPin2','111111'); await C.click('#uGo'); await C.waitForTimeout(800);
  ok(/ya lo usa otra persona/.test(await txt(C,'#uMsg')),'apodo ocupado: '+await txt(C,'#uMsg'));
  // otro dispositivo: PIN mal tres veces
  await B.goto(URL); await ready(B); await B.click('#userBtn'); await B.click('#uTabs button[data-t="old"]');
  await B.fill('#uName','rodo');
  for(const [pin,re] of [['000001',/2 intentos/],['000002',/1 intento/],['000003',/24 horas/]]){
    await B.fill('#uPin',pin); await B.click('#uGo'); await B.waitForTimeout(1200);
    ok(re.test(await txt(B,'#uMsg')),`PIN ${pin}: `+await txt(B,'#uMsg'));
  }
  await B.fill('#uPin','123456'); await B.click('#uGo'); await B.waitForTimeout(1000);
  ok(/bloqueado hasta/.test(await txt(B,'#uMsg')),'bloqueado aunque ponga el bueno: '+await txt(B,'#uMsg'));
  // la administración lo destraba
  await rest('pinlocks/rodo',{method:'PATCH',body:JSON.stringify({fields:{fails:{integerValue:0},level:{integerValue:0},at:{nullValue:null}}})});
  await B.click('#uGo'); await B.waitForLoadState('load'); await B.waitForTimeout(2500); await ready(B);
  ok(await B.evaluate(()=>Reg.uid())===uidA,'entró con el mismo jugador que en el otro dispositivo');
  ok(/🦉 Rodo/.test(await txt(B,'#userBtn')),'usuario recuperado: '+await txt(B,'#userBtn'));
  const pl=await rest('pinlocks/rodo'); ok(pl.fields.fails.integerValue==='0','intentos reseteados');
  // salir del usuario
  B.on('dialog',d=>{ console.log('DIALOG '+d.message()); d.accept(); });
  await B.click('#userBtn'); await B.click('#uOut'); await B.click('#uOut'); await B.waitForTimeout(3000); await ready(B);
  ok(await B.evaluate(()=>Reg.uid())!==uidA && /Elegí tu usuario/.test(await txt(B,'#userBtn')),'salió: vuelve a jugar sin usuario');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
