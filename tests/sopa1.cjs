const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async p=>(await fetch(FS+p,{headers:{Authorization:'Bearer owner'}})).json();
(async()=>{
  const br=await chromium.launch(); const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
  const txt=s=>p.$eval(s,e=>e.textContent.trim());
  await p.goto(URL); await p.evaluate(()=>localStorage.setItem('rodo-sopa-mode','c')); await p.goto(URL+'#sopa'); await p.reload();
  await p.waitForFunction(()=>/\d/.test(document.querySelector('#view-sopa .pid').textContent),null,{timeout:20000});
  const n=(await txt('#view-sopa .pid')).match(/\d+/)[0];
  const d=(await rest(`puzzles/sopa-es-${n}`)).fields.data.mapValue.fields, N=+d.n.integerValue;
  const grid=d.grid.arrayValue.values.map(v=>v.stringValue), W=d.words.arrayValue.values.map(v=>({w:v.mapValue.fields.w.stringValue, cells:v.mapValue.fields.cells.arrayValue.values.map(x=>+x.integerValue)}));
  await p.click('#view-sopa .gatecard button'); await p.waitForTimeout(300);
  const tap=async i=>{ await p.click(`#sGrid .scell[data-r="${Math.floor(i/N)}"][data-c="${i%N}"]`); await p.waitForTimeout(120); };
  // un trazo de 3 letras que no sea palabra
  const isWord=s=>W.some(o=>o.w===s||o.w===[...s].reverse().join(''));
  let a=-1; for(let r=0;r<N&&a<0;r++) for(let c=0;c+2<N;c++){ const s=grid[r].slice(c,c+3); if(!isWord(s)){ a=r*N+c; break; } }
  await tap(a); await tap(a+2);
  ok(await p.evaluate(()=>Reg.cur('sopa').e)===1,'trazo equivocado: +10 s ('+await txt('#view-sopa .ppen')+')');
  await tap(a); await tap(a+2);
  ok(await p.evaluate(()=>Reg.cur('sopa').e)===1,'el mismo trazo no vuelve a sumar');
  await tap(a); await tap(a+1);
  ok(await p.evaluate(()=>Reg.cur('sopa').e)===1,'un trazo de 2 letras no cuenta');
  const max=Math.ceil(W.length/3);
  ok(new RegExp(`quedan ${max}\\)`).test(await txt('#sHint')),'botón: '+await txt('#sHint'));
  await p.click('#sHint'); await p.waitForTimeout(300);
  const fc=await p.$$eval('#sGrid .scell.first',e=>e.map(x=>[+x.dataset.r,+x.dataset.c,x.textContent]));
  const o=W.find(o=>o.cells[0]===fc[0][0]*N+fc[0][1]);
  ok(fc.length===1 && o && o.w[0]===fc[0][2],'marca la primera letra de '+(o&&o.w)+': '+fc[0][2]);
  ok(new RegExp(o.w[0]+'…').test(await txt('#sList')),'en las pistas aparece "'+o.w[0]+'…"');
  ok(await p.evaluate(()=>Reg.cur('sopa').h)===1 && /quedan \d+/.test(await txt('#sHint')),'ayuda +60 s: '+await txt('#sHint'));
  await tap(o.cells[0]); await tap(o.cells[o.cells.length-1]);
  ok((await p.$$eval('#sGrid .scell.first',e=>e.length))===0,'al encontrarla desaparece la marca');
  for(const x of W.filter(x=>x!==o)){ await tap(x.cells[0]); await tap(x.cells[x.cells.length-1]); }
  await p.waitForSelector('#sWin',{state:'visible'}); await p.waitForTimeout(1500);
  const s=(await rest(`scores/sopa-es-${n}/players`)).documents[0].fields;
  ok(+s.e.integerValue===1 && +s.h.integerValue===1 && s.ok.booleanValue,'guardado: 1 error, 1 ayuda');
  ok(await p.$eval('#sHint',b=>b.disabled),'al terminar el botón queda deshabilitado');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
