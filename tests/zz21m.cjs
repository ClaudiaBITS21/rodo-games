const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL='http://localhost:5055/';
(async()=>{
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const F = await import('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId:'demo-rodo', firestore:{ host:'127.0.0.1', port:8080 } });
  const db = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  await db(async f=>{ await F.setDoc(F.doc(f,'tourneys/P'),{mode:'mesas',cap:64,name:'TORNEO POR MESAS',fee:0,bases:'',lang:'en',go:null,champ:null,cur:0,at:F.Timestamp.now(),st:'open',ast:false,pub:F.Timestamp.fromMillis(Date.now()-60000),place:'',when:F.Timestamp.now(),rounds:[{g:'anagrama',lang:'es',dur:15}],orgs:[],lnurl:''});
    await F.setDoc(F.doc(f,'tourneys/P/groups/g1'),{cap:null,mem:{},res:{},nm:'Mesa 1',i:1,em:'',req:null}); });
  const br=await chromium.launch();
  for(const mode of ['nombre','usuario-antes','usuario-despues']){
    const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage(); p.on('pageerror',e=>console.log(mode,'pageerror',e.message));
    p.on('console',m=>{ if(m.type()==='error') console.log(mode,'console',m.text().slice(0,200)); });
    await p.goto(URL+'?mesa=P~g1'); await p.waitForSelector('#mName',{timeout:20000});
    const mkUser=async()=>{ await p.click('#userBtn'); await p.waitForSelector('#userDlg[open]'); await p.fill('#uName','21M'+mode.length); await p.fill('#uPin','123456'); await p.fill('#uPin2','123456'); await p.click('#uGo'); await p.waitForTimeout(2500); console.log(mode,'usuario:',await p.$eval('#uMsg',e=>e.textContent).catch(()=>'-')); if(await p.$('#userDlg[open]')) await p.click('#uX'); };
    if(mode==='usuario-antes') await mkUser();
    await p.waitForSelector('#mName',{timeout:5000}).catch(()=>{});
    await p.fill('#mName','21M'); await p.click('[data-mesa="join"]'); await p.waitForTimeout(2500);
    console.log(mode,'->',(await p.$eval('#mesaBody',e=>e.textContent.replace(/\s+/g,' '))).slice(0,160));
    if(mode==='usuario-despues'){ await mkUser(); await p.waitForTimeout(1500); console.log(mode,'después ->',(await p.$eval('#mesaBody',e=>e.textContent.replace(/\s+/g,' '))).slice(0,160)); }
  }
  await br.close(); await env.cleanup(); process.exit(0);
})().catch(e=>{ console.log('ERROR',e.message); process.exit(1); });
