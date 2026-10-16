// Sopa: más palabras por tamaño, 2 extra escondidas (−30 s) y palabras del glosario que aparecen de casualidad
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async p=>(await fetch(FS+p,{headers:{Authorization:'Bearer owner'}})).json();
(async()=>{
  const br=await chromium.launch(); const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
  const txt=s=>p.$eval(s,e=>e.textContent.trim());
  await p.goto(URL+'#sopa'); await p.waitForFunction(()=>/\d/.test(document.querySelector('#view-sopa .pid').textContent),null,{timeout:20000});
  const n=(await txt('#view-sopa .pid')).match(/\d+/)[0];
  const d=(await rest(`puzzles/sopa-es-${n}`)).fields.data.mapValue.fields, N=+d.n.integerValue;
  const W=d.words.arrayValue.values.map(v=>({w:v.mapValue.fields.w.stringValue, cells:v.mapValue.fields.cells.arrayValue.values.map(x=>+x.integerValue)}));
  const X=d.bonus.arrayValue.values.map(v=>({w:v.mapValue.fields.w.stringValue, cells:v.mapValue.fields.cells.arrayValue.values.map(x=>+x.integerValue)}));
  ok(N===12 && W.length===14 && X.length===2,`mediana: ${W.length} palabras y ${X.length} extra (${X.map(x=>x.w).join(', ')})`);
  ok((await txt('#sList')).includes('… …'),'las extra se ven como "…": '+(await txt('#sList')).slice(-60));
  await p.click('#view-sopa .gatecard button'); await p.waitForTimeout(300);
  const tap=async i=>{ await p.click(`#sGrid .scell[data-r="${Math.floor(i/N)}"][data-c="${i%N}"]`); await p.waitForTimeout(120); };
  const x=X[0]; await tap(x.cells[x.cells.length-1]); await tap(x.cells[0]);   // al revés también vale
  ok(await p.evaluate(()=>Reg.cur('sopa').b)===1 && /Palabra extra/.test(await txt('#sNote2')) && (await txt('#view-sopa .ppen'))==='−30 s','extra escondida: '+await txt('#sNote2')+' '+await txt('#view-sopa .ppen'));
  ok(new RegExp(x.w).test(await txt('#sList')) && /Extra: 1/.test(await txt('#sMeta')),'aparece en la lista: '+await txt('#sMeta'));
  await tap(x.cells[0]); await tap(x.cells[x.cells.length-1]);
  ok(await p.evaluate(()=>Reg.cur('sopa').b)===1 && await p.evaluate(()=>Reg.cur('sopa').e)===0,'la misma no cuenta dos veces ni como error');
  for(const o of W){ await tap(o.cells[0]); await tap(o.cells[o.cells.length-1]); }
  await p.waitForSelector('#sWin',{state:'visible'}); await p.waitForTimeout(1500);
  const s=(await rest(`scores/sopa-es-${n}/players`)).documents[0].fields;
  ok(+s.b.integerValue===1,'resultado guardado con b=1');
  ok(/− 0:30 por 1 palabra extra/.test(await txt('#view-sopa .wpts')),'puntos: '+await txt('#view-sopa .wpts'));
  // tamaños
  const g=await p.evaluate(()=>['chica','media','grande'].map(s=>{ const o=GAMES.sopa.gen(s); return [o.n,o.words.length,o.bonus.length]; }));
  ok(JSON.stringify(g)==='[[10,10,2],[12,14,2],[15,20,2]]','tamaños: '+JSON.stringify(g));
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
