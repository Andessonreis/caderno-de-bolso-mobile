import type { ISODate, Profile } from './types';

/**
 * Ficha pública do produtor, codificada no QR. O formato é um contrato com o
 * site: `${WEB_URL}/ficha/#d=<payload>`, onde payload é base64url (sem padding)
 * dos bytes UTF-8 de JSON.stringify(ficha). Chaves vazias são omitidas.
 */
export interface Ficha {
  v: 1;
  n: string;
  m?: string;
  c?: string;
  o?: string;
  ct?: string;
  d?: number;
  r?: string;
  s?: string;
  cu?: string[];
  u?: ISODate;
}

export const FICHA_VERSION = 1;
export const MAX_CROPS = 12;
export const DEFAULT_WEB_URL = 'https://andessonreis.github.io/caderno-de-bolso-web';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Bytes UTF-8 de uma string (sem depender de TextEncoder). */
export function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

export function utf8Decode(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    let extra: number;
    if (b < 0x80) {
      cp = b;
      extra = 0;
    } else if (b >= 0xf0) {
      cp = b & 7;
      extra = 3;
    } else if (b >= 0xe0) {
      cp = b & 15;
      extra = 2;
    } else if (b >= 0xc0) {
      cp = b & 31;
      extra = 1;
    } else {
      throw new Error('UTF-8 inválido');
    }
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) throw new Error('UTF-8 inválido');
      cp = (cp << 6) | (c & 63);
    }
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

export function base64UrlEncode(bytes: number[]): string {
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

export function base64UrlDecode(s: string): number[] {
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('base64url inválido');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function clean(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/** Monta a ficha a partir do perfil, omitindo campos vazios. */
export function fichaFromProfile(profile: Profile, crops: string[], lastEntryDate?: ISODate): Ficha {
  const f: Ficha = { v: 1, n: profile.name.trim() };
  const m = clean(profile.municipality);
  const c = clean(profile.cooperative);
  const o = clean(profile.opac);
  const ct = clean(profile.certificateId);
  const r = clean(profile.nationalRegistry);
  const s = clean(profile.traceCode);
  if (m) f.m = m;
  if (c) f.c = c;
  if (o) f.o = o;
  if (ct) f.ct = ct;
  if (profile.certifiedSince) f.d = profile.certifiedSince;
  if (r) f.r = r;
  if (s) f.s = s;
  const cu = crops.map((x) => x.trim()).filter(Boolean).slice(0, MAX_CROPS);
  if (cu.length) f.cu = cu;
  if (lastEntryDate) f.u = lastEntryDate;
  return f;
}

export function encodeFicha(f: Ficha): string {
  return base64UrlEncode(utf8Encode(JSON.stringify(f)));
}

function isOptString(v: unknown): boolean {
  return v === undefined || typeof v === 'string';
}

/** Decodifica e valida. Retorna null se o conteúdo não for uma ficha válida. */
export function decodeFicha(payload: string): Ficha | null {
  try {
    const obj: unknown = JSON.parse(utf8Decode(base64UrlDecode(payload)));
    if (typeof obj !== 'object' || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (o.v !== FICHA_VERSION || typeof o.n !== 'string' || !o.n) return null;
    for (const k of ['m', 'c', 'o', 'ct', 'r', 's', 'u']) if (!isOptString(o[k])) return null;
    if (o.d !== undefined && typeof o.d !== 'number') return null;
    if (o.cu !== undefined && (!Array.isArray(o.cu) || !o.cu.every((x) => typeof x === 'string'))) return null;
    return o as unknown as Ficha;
  } catch {
    return null;
  }
}

export function webUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL;
  return (fromEnv && fromEnv.trim() ? fromEnv.trim() : DEFAULT_WEB_URL).replace(/\/+$/, '');
}

/** O site é exportado com barra no final das rotas, por isso `/ficha/#d=`. */
export function fichaUrl(f: Ficha, base: string = webUrl()): string {
  return `${base.trim().replace(/\/+$/, '')}/ficha/#d=${encodeFicha(f)}`;
}
