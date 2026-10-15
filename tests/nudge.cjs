const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/', FS='http://127.0.0.1:8080/v1/projects/demo-rodo/databases/(default)/documents/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
const rest=async(path,opt={})=>{ const r=await fetch(FS+path,{...opt,headers:{Authorization:'Bearer owner','content-type':'application/json'}}); return r.json(); };
(async()=>{
  const br=await chromium.launch(); const P=await (await br.newContext()).newPage(); P.on('pageerror',e=>console.log('pageerror',e.message));
  const ready=()=>P.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  await P.goto(URL); await ready(); await P.waitForTimeout(2500);
  ok(!(await P.$('#nudgeDlg[open]')),'jugador nuevo: no aparece');
  const uid=await P.evaluate(()=>Reg.uid());
  await rest(`fichas/${uid}?updateMask.fieldPaths=plays`,{method:'PATCH',body:JSON.stringify({fields:{plays:{mapValue:{fields:{"ahorcado-es":{integerValue:3}}}}}})});
  await P.reload(); await ready(); await P.waitForTimeout(2500);
  ok(!!(await P.$('#nudgeDlg[open]')),'recurrente: aparece "'+(await P.textContent('#ndT'))+'"');
  ok(/menos de 30 segundos/.test(await P.textContent('#ndT')) && /PIN/.test(await P.textContent('#ndP')),'texto ok');
  await P.click('#ndLater'); await P.reload(); await ready(); await P.waitForTimeout(2500);
  ok(!(await P.$('#nudgeDlg[open]')),'recordar más tarde: no vuelve a aparecer enseguida');
  await P.evaluate(()=>localStorage.removeItem('rodo-nudge')); await P.reload(); await ready(); await P.waitForTimeout(2500);
  await P.click('#ndGo'); await P.waitForTimeout(500);
  ok(!!(await P.$('#userDlg[open]')),'crear mi usuario abre la ventana de usuario');
  await P.keyboard.press('Escape');
  // estadísticas sin usuario
  await P.evaluate(()=>location.hash='stats'); await P.waitForTimeout(3000);
  ok(/sin usuario/.test(await P.textContent('#stHead')),'stats sin usuario invita a crearlo');
  ok(/0 partidas terminadas/.test((await P.$eval('#stBody',e=>e.innerText)).replace(/\s+/g,' ')),'stats vacías');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
