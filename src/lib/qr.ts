import QRCode from 'qrcode';

/** Nível de correção usado em todo o app (contrato com o site). */
export const QR_ECL = 'M' as const;

/**
 * Desenha o QR como SVG em texto, para colocar no PDF do cartão.
 * Usa a mesma biblioteca que desenha o QR na tela.
 */
export function qrSvg(text: string, quiet = 2): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: QR_ECL });
  const size = modules.size;
  const total = size + quiet * 2;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules.get(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="100%" height="100%" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
