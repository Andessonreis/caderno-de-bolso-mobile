// Fotos ficam na pasta de documentos do app, em `fotos/<pasta>/<arquivo>`.
// Os dados guardam só o caminho relativo a `fotos/` (ex.: "anotacoes/1732.jpg"),
// porque o endereço completo da pasta do app pode mudar entre atualizações.

const SAFE_PART = /^[A-Za-z0-9._-]+$/;

/** Caminho relativo válido: "pasta/arquivo.ext", sem "..", sem barra no começo. */
export function isRelativePhotoPath(p: string): boolean {
  const parts = p.split('/');
  return parts.length === 2 && parts.every((x) => x !== '..' && x !== '.' && SAFE_PART.test(x));
}

/**
 * Converte o que foi salvo (endereço completo antigo ou caminho relativo) para
 * o caminho relativo. Retorna undefined se não der para reconhecer.
 */
export function toRelativePhotoPath(stored: string | undefined): string | undefined {
  if (!stored) return undefined;
  if (isRelativePhotoPath(stored)) return stored;
  const m = /\/fotos\/([^/]+\/[^/?#]+)$/.exec(stored);
  return m && isRelativePhotoPath(m[1]) ? m[1] : undefined;
}
