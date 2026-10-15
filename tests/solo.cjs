const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch(); const P=await (await br.newContext()).newPage();
  P.on('pageerror',e=>console.log('pageerror',e.message));
  const txt=s=>P.$eval(s,e=>e.textContent.trim());
  const ready=async g=>P.waitForFunction(g=>/\d/.test(document.querySelector(`#view-${g} .pid`).textContent),g,{timeout:20000});
  // acróstico: comprobar cuesta 5 s y el botón lo dice
  await P.goto(URL+'#acrostico'); await ready('acrostico');
  ok(/\+5 s/.test(await txt('#checkBtn')),'botón: '+await txt('#checkBtn'));
  ok(/\+60 s/.test(await txt('#hintBtn')),'botón: '+await txt('#hintBtn'));
  ok(/Comprobar \+5 s/.test(await txt('#view-acrostico .pcost')),'línea: '+await txt('#view-acrostico .pcost'));
  await P.click('#view-acrostico .gatecard button'); await P.click('#checkBtn');
  ok(await txt('#view-acrostico .ppen')==='+5 s','aviso al comprobar: '+await txt('#view-acrostico .ppen'));
  // sopa: el modo no se cambia a mitad de partida
  await P.goto(URL+'#sopa'); await ready('sopa');
  await P.click('#view-sopa .gatecard button'); await P.click('#sModeSeg button[data-m="c"]');
  ok(/antes de empezar/.test(await txt('#view-sopa .pmsg')),'modo bloqueado: '+await txt('#view-sopa .pmsg'));
  ok(await P.$eval('#sModeSeg button[data-m="w"]',b=>b.getAttribute('aria-pressed'))==='true','sigue en palabras');
  // semilla: el reloj no corre mientras memorizás
  await P.goto(URL+'#semilla'); await ready('semilla'); await P.waitForTimeout(2200);
  ok(await txt('#view-semilla .ptime')==='','reloj apagado antes de armar');
  await P.click('#pStart'); await P.waitForTimeout(2200);
  ok(await txt('#view-semilla .ptime')==='','reloj apagado mientras memorizás');
  await P.click('#pReady'); await P.waitForTimeout(1300);
  ok(/^0:0[01]$/.test(await txt('#view-semilla .ptime')),'reloj arranca al armar: '+await txt('#view-semilla .ptime'));
  // invitación: opciones de la sopa
  await P.goto(URL); await P.waitForSelector('#live:not([hidden])',{timeout:30000});
  await P.click('#ivBtn'); await P.click('#ivGames button[data-g="sopa"]');
  ok(await P.isVisible('#ivSopa button[data-s="grande"]') && await P.isVisible('#ivSopa button[data-m="c"]'),'invitación a sopa: tamaño y modo');
  ok(/Sopa de letras de 12×12/.test(await txt('#ivOutT')),'título: '+await txt('#ivOutT'));
  await P.click('#ivSopa button[data-s="grande"]'); await P.click('#ivSopa button[data-m="c"]');
  ok(/de 15×15, con pistas, en castellano/.test(await txt('#ivOutT')),'título: '+await txt('#ivOutT'));
  await P.click('#ivBackPick'); await P.click('#ivGames button[data-g="ahorcado"]');
  ok(!(await P.$('#ivSopa button[data-s]')) && !!(await P.$('#ivSopa button[data-l]')),'ahorcado: solo idioma');
  await P.click('#ivBackPick'); await P.click('#ivGames button[data-g="semilla"]');
  ok(!!(await P.$('#ivSopa button[data-w="24"]')),'semilla: cantidad de palabras');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
