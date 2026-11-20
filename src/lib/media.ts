// Fotos e recados de voz ficam na pasta de documentos do app. Os dados guardam
// só o caminho relativo "<pasta>/<arquivo>" (ex.: "anotacoes/1732.jpg",
// "audios/1732.m4a"), porque o endereço completo da pasta do app pode mudar
// entre atualizações e não vale em outro aparelho.

export type MediaFolder = 'anotacoes' | 'caderno' | 'audios';

export const MEDIA_FOLDERS: MediaFolder[] = ['anotacoes', 'caderno', 'audios'];

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** Caminho relativo válido: pasta conhecida + nome de arquivo simples. */
export function isRelativeMediaPath(p: unknown): p is string {
  if (typeof p !== 'string') return false;
  const parts = p.split('/');
  return (
    parts.length === 2 &&
    MEDIA_FOLDERS.includes(parts[0] as MediaFolder) &&
    parts[1] !== '.' &&
    parts[1] !== '..' &&
    SAFE_NAME.test(parts[1])
  );
}

export function mediaFolderOf(p: string): MediaFolder {
  return p.split('/')[0] as MediaFolder;
}

/**
 * Converte o que foi salvo (endereço completo antigo de foto ou caminho
 * relativo) para o caminho relativo. Retorna undefined se não reconhecer.
 */
export function toRelativeMediaPath(stored: string | undefined): string | undefined {
  if (!stored) return undefined;
  if (isRelativeMediaPath(stored)) return stored;
  const m = /\/fotos\/((?:anotacoes|caderno)\/[^/?#]+)$/.exec(stored);
  return m && isRelativeMediaPath(m[1]) ? m[1] : undefined;
}
