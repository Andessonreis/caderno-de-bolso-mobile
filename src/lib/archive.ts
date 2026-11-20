// Arquivo único de cópia de segurança: um .zip com `dados.json` e as fotos e
// recados de voz em `midia/<pasta>/<arquivo>`. Funções puras (bytes entram,
// bytes saem); quem lê e grava no aparelho é src/lib/device.ts.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import type { BackupData } from './backup';
import { isRelativeMediaPath } from './media';

export const DATA_FILE = 'dados.json';
export const MEDIA_PREFIX = 'midia/';

export interface MediaFile {
  path: string;
  bytes: Uint8Array;
}

/** Os arquivos .zip começam com "PK\x03\x04". */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Mídia de registros não apagados, sem repetição. */
export function mediaPathsOf(data: Pick<BackupData, 'entries' | 'photos'>): string[] {
  const paths = new Set<string>();
  for (const e of data.entries) {
    if (e.deletedAt) continue;
    if (e.photo && isRelativeMediaPath(e.photo)) paths.add(e.photo);
    if (e.audio && isRelativeMediaPath(e.audio)) paths.add(e.audio);
  }
  for (const p of data.photos) if (!p.deletedAt && isRelativeMediaPath(p.file)) paths.add(p.file);
  return [...paths];
}

export function buildArchive(data: BackupData, media: MediaFile[]): Uint8Array {
  const files: Zippable = { [DATA_FILE]: [strToU8(JSON.stringify(data)), { level: 6 }] };
  for (const m of media) {
    if (!isRelativeMediaPath(m.path)) continue;
    // Foto e áudio já são comprimidos: guardar sem compressão é mais rápido.
    files[`${MEDIA_PREFIX}${m.path}`] = [m.bytes, { level: 0 }];
  }
  return zipSync(files);
}

export interface ArchiveContent {
  json: string;
  media: MediaFile[];
}

/**
 * Lê o .zip. Ignora qualquer arquivo fora de `dados.json` e `midia/<pasta>/<nome>`
 * (nunca grava fora das pastas do app). Retorna null se não for uma cópia válida.
 */
export function readArchive(bytes: Uint8Array): ArchiveContent | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return null;
  }
  const data = files[DATA_FILE];
  if (!data) return null;
  const media: MediaFile[] = [];
  for (const [name, content] of Object.entries(files)) {
    if (!name.startsWith(MEDIA_PREFIX)) continue;
    const path = name.slice(MEDIA_PREFIX.length);
    if (isRelativeMediaPath(path)) media.push({ path, bytes: content });
  }
  return { json: strFromU8(data), media };
}

/** Texto de um arquivo .json antigo (versão 1). */
export function bytesToText(bytes: Uint8Array): string {
  return strFromU8(bytes);
}
