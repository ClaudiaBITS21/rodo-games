// QR en SVG para la pantalla de pago (bitcoin:…?amount=…)
import qrcode from "qrcode-generator";
export function qrSvg(text, cell = 5) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
