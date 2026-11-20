// Código para ligar outro celular ao mesmo caderno:
// cadernodebolso://ligar?c=<conta>&k=<chave>

export interface Credentials {
  conta: string;
  chave: string;
}

export const LINK_SCHEME = 'cadernodebolso';

const CONTA_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAVE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export function isValidCredentials(c: Partial<Credentials> | null | undefined): c is Credentials {
  return Boolean(c && typeof c.conta === 'string' && CONTA_RE.test(c.conta) && typeof c.chave === 'string' && CHAVE_RE.test(c.chave));
}

export function buildLink(c: Credentials): string {
  return `${LINK_SCHEME}://ligar?c=${c.conta}&k=${c.chave}`;
}

/**
 * Lê o código colado ou lido do QR. Aceita o endereço completo ou só a parte
 * "c=...&k=...", com espaços e quebras de linha em volta.
 */
export function parseLink(text: string): Credentials | null {
  const clean = text.trim().replace(/\s+/g, '');
  const query = clean.includes('?') ? clean.slice(clean.indexOf('?') + 1) : clean;
  let conta: string | undefined;
  let chave: string | undefined;
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    if (k === 'c') conta = v?.toLowerCase();
    if (k === 'k') chave = v;
  }
  const c = { conta, chave };
  return isValidCredentials(c) ? c : null;
}

/** 32 bytes aleatórios em base64url sem padding (43 caracteres). */
export function keyFromBytes(bytes: Uint8Array): string {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += B64[c & 63];
  }
  return out;
}
