// Camada fina de rede da cópia na internet. Só `fetch`, sem SDK, para manter o
// app leve. O `fetch` é injetável para os testes.

import type { VisitaParaGrupo } from '@/lib/grupo';

import { MEDIA_BUCKET, type ServiceConfig } from './config';
import type { Credentials } from './links';
import type { OutgoingRecord, RemoteRecord } from './records';

export type SyncErrorKind = 'chave' | 'rede' | 'servidor' | 'dados';

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
    readonly status?: number,
    /** O `message` que o servidor mandou (ex.: "limite_de_registros"), quando veio. */
    readonly serverMessage?: string,
  ) {
    super(message);
  }
}

/** Tempo máximo de uma chamada ao servidor. Passou disso, conta como sem internet. */
export const REQUEST_TIMEOUT_MS = 30_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SyncResponse {
  seq: number;
  tem_mais: boolean;
  mudancas: RemoteRecord[];
}

function errorKind(status: number, body: unknown): SyncErrorKind {
  const text = typeof body === 'object' && body ? JSON.stringify(body) : String(body ?? '');
  if (text.includes('chave_nao_confere') || text.includes('28000')) return 'chave';
  if (
    text.includes('mudancas_invalidas') ||
    text.includes('visitas_invalidas') ||
    text.includes('registro_grande_demais') ||
    text.includes('limite_de_registros')
  )
    return 'dados';
  if (status === 401 || status === 403) return 'chave';
  return 'servidor';
}

function serverMessageOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || !body) return undefined;
  const m = (body as { message?: unknown }).message;
  return typeof m === 'string' ? m : undefined;
}

function httpError(res: Response, body: unknown): SyncError {
  return new SyncError(errorKind(res.status, body), `HTTP ${res.status}`, res.status, serverMessageOf(body));
}

/**
 * Erro do grupo: só "grupo_nao_encontrado" quer dizer código que não vale. Outro
 * 401/403 (ex.: chave do app recusada) é falha do serviço, não do código.
 */
function groupError(e: unknown): unknown {
  if (e instanceof SyncError && e.kind === 'chave' && e.serverMessage !== 'grupo_nao_encontrado') {
    return new SyncError('servidor', e.message, e.status, e.serverMessage);
  }
  return e;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class SyncApi {
  constructor(
    private readonly config: ServiceConfig,
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  /** Cabeçalhos de toda chamada. */
  headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.config.key, Authorization: `Bearer ${this.config.key}`, ...extra };
  }

  /**
   * Uma chamada com prazo: passou de `timeoutMs`, a chamada é cancelada e vira
   * erro de rede. A corrida garante a resposta mesmo se o `fetch` ignorar o cancelamento.
   */
  private async call(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SyncError('rede', 'sem resposta do servidor'));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.request(path, { ...init, signal: controller.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    let body: unknown;
    try {
      res = await this.fetchFn(`${this.config.url}${path}`, init);
      body = await readBody(res);
    } catch {
      throw new SyncError('rede', 'sem conexão');
    }
    if (!res.ok) throw httpError(res, body);
    return body;
  }

  private rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.call(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(args),
    });
  }

  async criarConta(chave: string): Promise<string> {
    const id = await this.rpc('caderno_criar_conta', { p_chave: chave });
    if (typeof id !== 'string') throw new SyncError('servidor', 'resposta inesperada');
    return id;
  }

  async chaveConfere(c: Credentials): Promise<boolean> {
    return (await this.rpc('caderno_chave_confere', { p_conta: c.conta, p_chave: c.chave })) === true;
  }

  async sincronizar(c: Credentials, desde: number, mudancas: OutgoingRecord[]): Promise<SyncResponse> {
    const body = await this.rpc('caderno_sincronizar', {
      p_conta: c.conta,
      p_chave: c.chave,
      p_desde: desde,
      p_mudancas: mudancas,
    });
    const r = body as Partial<SyncResponse> | null;
    if (!r || typeof r.seq !== 'number' || !Array.isArray(r.mudancas))
      throw new SyncError('servidor', 'resposta inesperada');
    return { seq: r.seq, tem_mais: Boolean(r.tem_mais), mudancas: r.mudancas };
  }

  async apagarConta(c: Credentials): Promise<void> {
    await this.rpc('caderno_apagar_conta', { p_conta: c.conta, p_chave: c.chave });
  }

  // ---------- Grupo (visitas reunidas para a coordenação) ----------
  // Código que não existe (ou grupo apagado) volta como erro do tipo 'chave'.

  /** Confere o código do grupo e devolve o nome dele. */
  async grupoConferir(codigo: string): Promise<string> {
    const r = (await this.rpc('caderno_grupo_conferir', { p_codigo: codigo }).catch((e: unknown) => {
      throw groupError(e);
    })) as { nome?: unknown } | null;
    if (!r || typeof r.nome !== 'string') throw new SyncError('servidor', 'resposta inesperada');
    return r.nome;
  }

  /**
   * Envia até 50 visitas para o grupo. Devolve quantas o servidor recebeu. Lote
   * recusado volta como erro do tipo 'dados', com o motivo em `serverMessage`
   * ("visitas_invalidas", "registro_grande_demais" ou "limite_de_registros").
   */
  async grupoEnviar(codigo: string, visitas: VisitaParaGrupo[]): Promise<number> {
    const r = (await this.rpc('caderno_grupo_enviar', { p_codigo: codigo, p_visitas: visitas }).catch((e: unknown) => {
      throw groupError(e);
    })) as {
      recebidas?: unknown;
    } | null;
    if (!r || typeof r.recebidas !== 'number') throw new SyncError('servidor', 'resposta inesperada');
    return r.recebidas;
  }

  // ---------- Arquivos (fotos e recados) ----------

  /** Endereço de envio e de exclusão de um arquivo. */
  mediaUrl(c: Credentials, remoteName: string): string {
    return `${this.config.url}/storage/v1/object/${MEDIA_BUCKET}/${c.conta}/${encodeURIComponent(remoteName)}`;
  }

  /** Endereço de leitura de um arquivo. */
  mediaDownloadUrl(c: Credentials, remoteName: string): string {
    return `${this.config.url}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${c.conta}/${encodeURIComponent(remoteName)}`;
  }

  /** Cabeçalhos dos arquivos: os de sempre mais a chave do caderno. */
  mediaHeaders(c: Credentials, extra: Record<string, string> = {}): Record<string, string> {
    return this.headers({ 'x-caderno-chave': c.chave, ...extra });
  }

  /** Envia bytes (usado nos testes de rede; no celular o envio sai direto do arquivo). */
  async uploadBytes(c: Credentials, remoteName: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.call(this.mediaUrl(c, remoteName).slice(this.config.url.length), {
      method: 'POST',
      headers: this.mediaHeaders(c, { 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: bytes as unknown as BodyInit,
    });
  }

  async downloadBytes(c: Credentials, remoteName: string): Promise<Uint8Array> {
    let res: Response;
    try {
      res = await this.fetchFn(this.mediaDownloadUrl(c, remoteName), { headers: this.mediaHeaders(c) });
    } catch {
      throw new SyncError('rede', 'sem conexão');
    }
    if (!res.ok) throw httpError(res, await readBody(res));
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Nomes dos arquivos guardados para este caderno. */
  async listMedia(c: Credentials): Promise<string[]> {
    const names: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = (await this.call(`/storage/v1/object/list/${MEDIA_BUCKET}`, {
        method: 'POST',
        headers: this.mediaHeaders(c, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefix: `${c.conta}/`, limit: 1000, offset }),
      })) as { name?: unknown }[] | null;
      if (!Array.isArray(page) || page.length === 0) break;
      for (const item of page) if (typeof item.name === 'string') names.push(item.name);
      if (page.length < 1000) break;
    }
    return names;
  }

  /** Apaga arquivos deste caderno (em lotes). */
  async removeMedia(c: Credentials, remoteNames: string[]): Promise<void> {
    for (let i = 0; i < remoteNames.length; i += 500) {
      const prefixes = remoteNames.slice(i, i + 500).map((n) => `${c.conta}/${n}`);
      await this.call(`/storage/v1/object/${MEDIA_BUCKET}`, {
        method: 'DELETE',
        headers: this.mediaHeaders(c, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes }),
      });
    }
  }

  /** Apaga os arquivos e depois o caderno inteiro do servidor. */
  async apagarTudo(c: Credentials): Promise<void> {
    const names = await this.listMedia(c);
    if (names.length) await this.removeMedia(c, names);
    await this.apagarConta(c);
  }
}
