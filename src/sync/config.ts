// Endereço e chave pública do serviço da cópia na internet. São valores de
// cliente, feitos para ir dentro do app (o acesso aos dados de cada caderno
// depende da chave secreta guardada só no aparelho).

export const DEFAULT_SUPABASE_URL = 'https://usnrgytoupqwikgcwwjb.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_2Qv8OPUk-Aj9zHOIxEXwzA_yBvYG5g4';

export interface ServiceConfig {
  url: string;
  key: string;
}

export function serviceConfig(): ServiceConfig {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim() || DEFAULT_SUPABASE_KEY;
  return { url: url.replace(/\/+$/, ''), key };
}

/** Pasta (bucket) das fotos e recados. */
export const MEDIA_BUCKET = 'caderno-midia';
