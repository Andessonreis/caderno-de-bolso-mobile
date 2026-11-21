// Identificadores estáveis (UUID v4) para cada registro, para que uma
// sincronização futura possa juntar dados de vários aparelhos sem conflito de id.

import * as Crypto from 'expo-crypto';

type RandomBytes = (n: number) => Uint8Array;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Bytes aleatórios seguros: os do sistema, ou os do expo-crypto quando o motor JS não tem `crypto`. */
function defaultRandomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(bytes);
  return Crypto.getRandomValues(bytes);
}

/** UUID versão 4 (aleatório), no formato 8-4-4-4-12. */
export function uuid(random: RandomBytes = defaultRandomBytes): string {
  const b = random(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
