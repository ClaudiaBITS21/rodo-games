// Torneo por mesas: cada juego guarda su tablero (snap) y lo restaura igual (restore), para mostrarlo a la mesa y pasar el teclado
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch(); const p=await (await br.newContext({viewport:{width:1000,height:900}})).newPage(); p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.goto(URL); await p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const r=await p.evaluate(async()=>{
    const out={}, wait=ms=>new Promise(r=>setTimeout(r,ms));
    const round=async(g, play)=>{
      location.hash=g; await wait(400);
      const d=JSON.parse(JSON.stringify(GAMES[g].gen())); GAMES[g].load(JSON.parse(JSON.stringify(d)));
      await play(d); await wait(300);
      const a=JSON.stringify(GAMES[g].snap());
      GAMES[g].load(JSON.parse(JSON.stringify(d))); const z=JSON.stringify(GAMES[g].snap());
      GAMES[g].restore(JSON.parse(a)); await wait(50);
      const b=JSON.stringify(GAMES[g].snap());
      out[g]={same:a===b, changed:a!==z, a:a.slice(0,140)};
    };
    const type=(el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); };
    await round('acrostico', async()=>{ const c=[...document.querySelectorAll('#grid .cell:not([readonly])')]; type(c[0],'A'); type(c[1],'B'); document.getElementById('hintBtn').click(); document.getElementById('checkBtn').click(); });
    await round('ahorcado', async d=>{ const w=d.list[0].w; document.querySelector(`#hKeys .key[data-k="${w[0]}"]`).click(); document.querySelector('#hKeys .key:not([disabled])').click(); });
    await round('sopa', async d=>{ const N=d.n, o=d.words[0], cell=i=>document.querySelector(`#sGrid .scell[data-r="${Math.floor(i/N)}"][data-c="${i%N}"]`);
      const ev=(el,t)=>el.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:el.getBoundingClientRect().x+5,clientY:el.getBoundingClientRect().y+5,pointerId:1}));
      cell(o.cells[0]).click(); cell(o.cells[o.cells.length-1]).click(); document.getElementById('sHint').click(); });
    await round('criptograma', async()=>{ const c=[...document.querySelectorAll('#cQuote .cell')]; type(c[0],'A'); type(c[2],'E'); document.getElementById('cHint').click(); document.getElementById('cCheck').click(); });
    await round('anagrama', async d=>{ document.querySelector('#aTiles .atile').click(); document.querySelector('#aTiles .atile:not(.used)').click(); document.getElementById('aHint').click(); });
    await round('semilla', async()=>{ document.getElementById('pStart').click(); await wait(50); document.getElementById('pReady').click(); await wait(50);
      const w=[...document.querySelectorAll('#pChips .chip')]; const first=GAMES.semilla.snap(); w[0].click(); });
    return out;
  });
  for(const [g,x] of Object.entries(r)) ok(x.same && x.changed, `${g}: el tablero se restaura igual (${x.a})`);
  // en la semilla, mientras memoriza, quien mira no corre la cuenta regresiva
  const memo=await p.evaluate(async()=>{ location.hash='semilla'; await new Promise(r=>setTimeout(r,300)); const d=GAMES.semilla.gen(); GAMES.semilla.load(d);
    GAMES.semilla.restore({st:'memo', l:40, n:0, e:0, ch:[]}, true); await new Promise(r=>setTimeout(r,2200)); return GAMES.semilla.snap(); });
  ok(memo.st==='memo' && memo.l===40,'semilla: quien mira no corre la cuenta regresiva de memorizar');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
