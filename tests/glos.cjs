const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async p=>(await fetch(FS+p,{headers:{Authorization:'Bearer owner'}})).json();
(async()=>{
  const br=await chromium.launch(); const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message)); p.on('dialog',d=>{ console.log('DIALOG '+d.message()); d.accept(); });
  const txt=s=>p.$eval(s,e=>e.innerText.trim());
  await p.goto(URL+'#ahorcado'); await p.waitForFunction(()=>/\d/.test(document.querySelector('#view-ahorcado .pid').textContent),null,{timeout:20000});
  const n=(await txt('#view-ahorcado .pid')).match(/\d+/)[0];
  const L=(await rest(`puzzles/ahorcado6-es-${n}`)).fields.data.mapValue.fields.list.arrayValue.values.map(v=>v.mapValue.fields.w.stringValue);
  await p.click('#view-ahorcado .gatecard button');
  const all=[...'QWERTYUIOPASDFGHJKLÑZXCVBNM'];
  for(const c of [...new Set(L[0])].filter(c=>all.includes(c))){ await p.click(`#hKeys button[data-k="${c}"]`); await p.waitForTimeout(50); }
  await p.waitForTimeout(900); await p.click('#hEnd'); await p.click('#hEnd'); await p.waitForSelector('#hWin',{state:'visible'});
  await p.waitForTimeout(800);
  const chips=await p.$$eval('#hWin .lchips button',b=>b.map(x=>x.getAttribute('aria-pressed')));
  ok(chips.length===6 && chips.every(x=>x==='false') && !(await p.isVisible('#hWin .lcar')),'6 palabras, ninguna marcada, sin carrusel');
  for(const w of L.slice(0,6)){ await p.click(`#hWin .lchips button[data-w="${w}"]`); await p.waitForTimeout(250); }
  await p.waitForFunction(()=>document.querySelectorAll('#hWin .lcard').length===6 && !/Cargando/.test(document.querySelector('#hWin .lcar').textContent),null,{timeout:10000});
  await p.waitForTimeout(1200);
  const cs=await p.evaluate(()=>{ const c=document.querySelector('#hWin .lcar'); return {dots:document.querySelectorAll('#hWin .ldots button').length, on:[...document.querySelectorAll('#hWin .ldots button')].findIndex(b=>b.classList.contains('on')), h:c.getBoundingClientRect().height, w:c.clientWidth, sw:c.scrollWidth}; });
  ok(cs.dots===6 && cs.on===5 && cs.sw>cs.w*5,'carrusel con 6 tarjetas y 6 puntitos, muestra la última marcada: '+JSON.stringify(cs));
  await p.click('#hWin .ldots button:first-child'); await p.waitForTimeout(800);
  ok(await p.evaluate(()=>document.querySelector('#hWin .ldots button.on')===document.querySelector('#hWin .ldots button:first-child')),'tocar el primer puntito vuelve a la primera');
  await p.locator('#hWin .wlearn').scrollIntoViewIfNeeded(); await p.locator('#hWin .wlearn').screenshot({path:'learn390.png'});
  ok(/Sumaste 6 palabras/.test(await txt('#hWin .wlearn')),'guardadas 6');
  const le=(await rest('learned')).documents[0].fields; ok(le.w.arrayValue.values.length===6 && +le.n.integerValue===6,'guardado w y n = 6');
  await p.click(`#hWin .lchips button[data-w="${L[1]}"]`); await p.waitForTimeout(1500);
  const le2=(await rest('learned')).documents[0].fields; ok(le2.w.arrayValue.values.length===5,'desmarcar una: quedan 5');
  await p.evaluate(()=>location.hash='stats'); await p.waitForFunction(()=>/Mi glosario/.test(document.getElementById('stBody').textContent),null,{timeout:20000});
  const st=await txt('#stBody'); const m=st.match(/Mi glosario \(\d+ palabras?\)[\s\S]{0,260}/);
  ok(/Mi glosario \(5 palabras\)/.test(st),'estadísticas: '+(m?m[0].replace(/\s+/g,' '):''));
  // criptograma: sin palabras del glosario, tilde simple
  await p.evaluate(()=>location.hash='criptograma'); await p.waitForFunction(()=>/\d/.test(document.querySelector('#view-criptograma .pid').textContent),null,{timeout:20000});
  await p.click('#view-criptograma .gatecard button'); await p.click('#cGiveUp'); await p.click('#cGiveUp'); await p.waitForTimeout(800);
  ok(/¿Aprendiste alguna palabra nueva\?/.test(await txt('#cWin .wlearn')) && !(await p.$('#cWin .lchips')),'criptograma: tilde simple');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
