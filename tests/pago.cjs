// Panel: clave pública extendida → direcciones de cobro; estado de los pedidos on-chain en mempool.space (base falsa: las reglas se prueban en test.mjs)
const { chromium } = require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok  ':'FAIL')+' '+m); if(!c) fails++; };
(async()=>{
  const br=await chromium.launch();
  const a=await (await br.newContext({viewport:{width:1300,height:900}})).newPage(); a.on('pageerror',e=>console.log('pageerror',e.message));
  await a.route('https://mempool.space/api/**', r=>r.fulfill({json:{chain_stats:{funded_txo_sum:50000}, mempool_stats:{funded_txo_sum:0}}}));
  await a.addInitScript(()=>{
    const DB={ 'orders':[{id:'R2345AB', items:{bip39:1}, name:'Ana', email:'a@x.com', phone:'1155554444', place:'CABA', ship:'envio', pay:'btc', total:90000, lang:'es', st:'nuevo', at:1, ai:0, addr:'bc1qviejadireccion000', sats:90000, rate:100000000}] };
    const docs={}; window.__docs=docs;
    const snap=n=>({forEach:f=>(DB[n]||[]).forEach(x=>{ const {id,...d}=x; f({id, data:()=>d}); })});
    const A={ db:{}, collection:(db,n)=>n, collectionGroup:(db,n)=>n, getDocs:async n=>snap(n), doc:(db,c,id)=>c+'/'+id,
      getDoc:async ref=>({exists:()=>ref in docs, data:()=>docs[ref]}),
      setDoc:async(ref,d)=>{ docs[ref]=d; }, deleteDoc:async ref=>{ delete docs[ref]; }, serverTimestamp:()=>Date.now(),
      writeBatch:()=>{ const ops=[]; return { set:(r,d)=>ops.push(()=>docs[r]=d), delete:r=>ops.push(()=>delete docs[r]), commit:async()=>ops.forEach(f=>f()) }; },
      login:async()=>{}, logout:()=>{}, onState:cb=>setTimeout(()=>cb({email:'ce.andragnes@gmail.com'}),50) };
    let real=null;
    Object.defineProperty(window,'__adminResolve',{configurable:true, get:()=>real&&(x=>real(A)), set:v=>{ real=v; }});
  });
  await a.goto('http://localhost:5055/#admin');
  await a.waitForFunction(()=>/Cobro en bitcoin on-chain/.test(document.getElementById('admBody').textContent),null,{timeout:20000});
  await a.click('[data-admtab="tienda"]');   // el panel va en solapas
  ok(true,'la segunda administradora entra al panel');
  await a.waitForFunction(()=>/50000 sats confirmados/.test(document.getElementById('admBody').textContent) && /faltan 40000/.test(document.getElementById('admBody').textContent),null,{timeout:10000});
  ok(true,'el pedido on-chain muestra lo que llegó según mempool.space y cuánto falta');
  // clave de prueba de BIP84 (las 12 palabras "abandon … about"): su primera dirección es conocida
  const Z='zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
  await a.fill('#pyKey','xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'); await a.click('#pyPrev'); await a.waitForTimeout(800);
  ok(/xpub, ypub o zpub/.test(await a.$eval('#pyMsg',e=>e.textContent)),'rechaza una clave privada: '+await a.$eval('#pyMsg',e=>e.textContent));
  await a.fill('#pyKey',Z); await a.click('#pyPrev'); await a.waitForTimeout(500);
  ok(/bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu/.test(await a.$eval('#pyList',e=>e.textContent)),'muestra las primeras direcciones para comparar');
  await a.click('#pySave');
  await a.waitForFunction(()=>window.__docs['btcpay/cfg'],null,{timeout:10000});
  const d=await a.evaluate(()=>window.__docs);
  ok(d['payaddr/0'].a==='bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu' && d['payaddr/49'] && !d['payaddr/50'] && d['btcidx/main'].n===0 && d['btcpay/cfg'].cnt===50,'guarda la clave y 50 direcciones');
  await a.waitForFunction(()=>/Direcciones libres: 50/.test(document.getElementById('admBody').textContent),null,{timeout:10000});
  await a.click('#pyMore'); await a.waitForFunction(()=>window.__docs['payaddr/99'],null,{timeout:10000});
  ok((await a.evaluate(()=>window.__docs['btcpay/cfg'].cnt))===100,'genera 50 más');
  await br.close(); console.log(fails?`${fails} fallas`:'TODO OK'); process.exit(fails?1:0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
