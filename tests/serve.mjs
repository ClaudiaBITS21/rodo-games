// Servidor de prueba: la página real, con Firebase local y conectada a los emuladores
import http from "http"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const HERE=path.dirname(fileURLToPath(import.meta.url)), PUB=path.resolve(HERE,"../public"), NM=path.resolve(HERE,"node_modules/firebase");
const fix=s=>s.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\//g,"/fb/");
http.createServer((q,r)=>{
  const u=q.url.split("?")[0];
  if(u==="/__/firebase/init.json"){ r.writeHead(200,{"content-type":"application/json"}); return r.end(JSON.stringify({apiKey:"fake-key",authDomain:"localhost",projectId:"demo-rodo",appId:"1:1:web:1"})); }
  if(u.startsWith("/fb/")){ r.writeHead(200,{"content-type":"text/javascript"}); return r.end(fix(fs.readFileSync(path.join(NM,u.slice(4)),"utf8"))); }
  if(u==="/"||u==="/index.html"){
    let h=fix(fs.readFileSync(PUB+"/index.html","utf8"));
    h=h.replace("signInWithEmailAndPassword }","signInWithEmailAndPassword, connectAuthEmulator }")
       .replace("Timestamp, writeBatch } from","Timestamp, writeBatch, connectFirestoreEmulator } from")
       .replace("const auth = getAuth(app);","const auth = getAuth(app); connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});")
       .replace("const db = getFirestore(app);","const db = getFirestore(app); connectFirestoreEmulator(db,'127.0.0.1',8080);");
    const et=fs.existsSync(path.join(HERE,"etag.txt"))?fs.readFileSync(path.join(HERE,"etag.txt"),"utf8").trim():"v1";
    r.writeHead(200,{"content-type":"text/html","etag":'"'+et+'"'}); return r.end(q.method==="HEAD"?undefined:h);
  }
  const f=path.join(PUB,u); if(f.startsWith(PUB)&&fs.existsSync(f)&&fs.statSync(f).isFile()){ r.writeHead(200); return r.end(fs.readFileSync(f)); }
  r.writeHead(404); r.end();
}).listen(5055,()=>console.log("listo 5055"));
