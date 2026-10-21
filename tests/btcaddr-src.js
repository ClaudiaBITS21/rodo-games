// Direcciones de recepción desde una clave pública extendida (xpub / ypub / zpub), sin claves privadas.
import { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";
const VER = { xpub: 0x0488b21e, ypub: 0x049d7cb2, zpub: 0x04b24746 };
// tipo por defecto según el prefijo: zpub → bc1q (nativa segwit), ypub → 3… (segwit anidada), xpub → 1… (legacy)
export const kindOf = key => key.startsWith("zpub") ? "wpkh" : key.startsWith("ypub") ? "sh-wpkh" : "pkh";
export function derive(key, from = 0, n = 5, kind) {
  key = String(key).trim();
  const pre = key.slice(0, 4); if (!VER[pre]) throw new Error("La clave tiene que empezar con xpub, ypub o zpub.");
  const hd = HDKey.fromExtendedKey(key, { private: 0, public: VER[pre] });
  if (hd.privateKey) throw new Error("Esa es una clave privada: no la pegues nunca. Hace falta la pública.");
  const recv = hd.deriveChild(0), k = kind || kindOf(key), out = [];
  for (let i = from; i < from + n; i++) {
    const pub = recv.deriveChild(i).publicKey;
    const a = k === "wpkh" ? btc.p2wpkh(pub).address : k === "sh-wpkh" ? btc.p2sh(btc.p2wpkh(pub)).address : btc.p2pkh(pub).address;
    out.push(a);
  }
  return out;
}
