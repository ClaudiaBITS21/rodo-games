const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const mk=async n=>{ const p=await (await br.newContext()).newPage(); p.on('pageerror',e=>console.log(n,'pageerror',e.message)); return p; };
  const txt=(p,s)=>p.$eval(s,e=>e.textContent.trim());
  const ready=p=>p.waitForFunction(()=>typeof Reg!=='undefined'&&Reg.uid&&Reg.uid(),null,{timeout:20000});
  const user=async(p,name)=>{ await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]'); await p.fill('#uName',name); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); await p.waitForTimeout(1800); };
  const A=await mk('A'), B=await mk('B'), C=await mk('C');
  for(const [p,n] of [[A,'Ana'],[B,'Beto'],[C,'Carla']]){ await p.goto(URL); await ready(p); await user(p,n); }
  const who=async()=>{ for(let i=0;i<30;i++){ for(const [p,n] of [[B,'B'],[C,'C']]) if(await p.$('#ivIn[open]')) return [p,n]; await A.waitForTimeout(500); } return [null,null]; };
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="anagrama"]'); await A.click('#ivSend');
  const [p1,n1]=await who(); ok(!!p1,'primer sorteado: '+n1);
  ok(/Rechazar todas/.test(await txt(p1,'#ivOff')),'botón Rechazar todas');
  await p1.click('#ivNo');
  const other = p1===B ? C : B, on=p1===B?'C':'B';
  await other.waitForSelector('#ivIn[open]',{timeout:15000}); ok(true,'se invitó solo al otro: '+on);
  ok(/Probando con otra persona/.test(await txt(A,'#ivOutMsg'))||/Esperando/.test(await txt(A,'#ivWaitT')),'A: '+await txt(A,'#ivOutMsg')+' | '+await txt(A,'#ivWaitT'));
  await other.click('#ivNo'); await A.waitForSelector('#ivDone:not([hidden])',{timeout:15000});
  ok(/no aceptó/.test(await txt(A,'#ivOutMsg')) && /nadie más/.test(await txt(A,'#ivOutMsg')),'sin más candidatos: '+await txt(A,'#ivOutMsg'));
  await A.click('#ivOutX');
  // A de nuevo al azar: los dos rechazaron en esta sesión → no se los vuelve a sortear
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="anagrama"]'); await A.click('#ivSend'); await A.waitForTimeout(1500);
  ok(/No hay nadie/.test(await txt(A,'#ivOutMsg')) && !(await B.$('#ivIn[open]')) && !(await C.$('#ivIn[open]')),'no se repite al azar: '+await txt(A,'#ivOutMsg'));
  // C (otra persona) al azar a B: B ya rechazó una al azar en su sesión → se rechaza sola, sin ventanita
  await A.click('#ivOutX');
  await C.click('#ivBtn'); await C.click('#ivGames button[data-g="sopa"]'); await C.click('#ivSend'); await C.waitForTimeout(2500);
  ok(!(await B.$('#ivIn[open]')) && !(await A.$('#ivIn[open]'))===false || true,'(informativo)');
  ok(!(await B.$('#ivIn[open]')),'B no vuelve a ver invitaciones al azar en su sesión');
  await C.click('#ivOutX').catch(()=>{});
  // por nombre sí le llega
  await A.click('#ivBtn'); await A.click('#ivGames button[data-g="sopa"]'); await A.click('#ivWhoSeg button[data-who="name"]'); await A.waitForTimeout(1200);
  await A.fill('#ivName','beto'); await A.waitForTimeout(400); await A.click('#ivSugg button:has-text("Beto")'); await A.click('#ivSend');
  await B.waitForSelector('#ivIn[open]',{timeout:15000}); ok(true,'por nombre sí le llega a Beto');
  // rechazar todas
  await B.click('#ivOff'); await B.waitForTimeout(800);
  ok(!(await B.$eval('#ivRecv',e=>e.checked)),'rechazar todas apaga "Recibir invitaciones"');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
