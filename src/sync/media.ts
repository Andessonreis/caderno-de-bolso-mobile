// Nomes dos arquivos de mídia no servidor: a pasta da conta tem um nível só,
// então "anotacoes/1732.jpg" vira "anotacoes-1732.jpg".

import { isRelativeMediaPath } from '@/lib/media';

export function remoteMediaName(relative: string): string {
  return relative.replace('/', '-');
}

export function localMediaPath(remote: string): string | null {
  const i = remote.indexOf('-');
  if (i < 0) return null;
  const rel = `${remote.slice(0, i)}/${remote.slice(i + 1)}`;
  return isRelativeMediaPath(rel) ? rel : null;
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  webm: 'audio/webm',
};

/** Tipo do arquivo aceito pelo servidor, ou null se for um formato que precisa ser convertido antes. */
export function contentTypeFor(relative: string): string | null {
  const ext = relative.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? null;
}
