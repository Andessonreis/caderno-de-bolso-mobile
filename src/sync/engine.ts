// Motor da cópia na internet. Uma rodada: garante o caderno no servidor, envia
// fotos e recados novos, troca registros (envia a fila e recebe o que mudou
// desde o último cursor) e baixa os arquivos que faltam no aparelho.
// Pode ser chamado quantas vezes for preciso: repetir não duplica nada.

import { acknowledge } from '@/data/repository';
import { mediaPathsOf } from '@/lib/archive';
import type { Entry, NotebookPhoto } from '@/lib/types';
import type { SyncConfig } from '@/store';

import { SyncError, type SyncApi } from './api';
import type { Credentials } from './links';
import { buildOutgoing, mergeRemote, type SyncedState } from './records';

export type EngineState = SyncedState & { sync: SyncConfig };

export interface EngineStore {
  get(): EngineState;
  /** Aplica uma mudança calculada sobre o estado mais recente. */
  update(fn: (st: EngineState) => Partial<EngineState>): void;
}

export interface MediaTransport {
  exists(relative: string): boolean;
  upload(c: Credentials, relative: string): Promise<void>;
  download(c: Credentials, relative: string): Promise<void>;
}

export interface CredentialStore {
  load(): Promise<Credentials | null>;
  save(c: Credentials): Promise<void>;
  newKey(): string;
}

export interface EngineDeps {
  store: EngineStore;
  api: Pick<SyncApi, 'criarConta' | 'sincronizar'>;
  media: MediaTransport;
  credentials: CredentialStore;
}

export interface SyncOutcome {
  sent: number;
  received: number;
  uploaded: number;
  downloaded: number;
}

/** Limite de voltas por rodada (proteção contra laço sem fim). */
const MAX_ROUNDS = 50;

/** Mídia de registros do produtor (dados de exemplo nunca vão para a internet). */
export function ownMediaPaths(st: { entries: Entry[]; photos: NotebookPhoto[] }): string[] {
  return mediaPathsOf({ entries: st.entries.filter((e) => !e.exemplo), photos: st.photos });
}

/** Quantos itens ainda faltam ir para a internet (registros + arquivos). */
export function pendingCount(st: EngineState, exists: (relative: string) => boolean): number {
  const files = ownMediaPaths(st).filter((p) => !st.sync.enviados[p] && exists(p)).length;
  return st.pendingChanges.length + files;
}

async function ensureAccount(deps: EngineDeps): Promise<Credentials> {
  const saved = await deps.credentials.load();
  if (saved) return saved;
  const chave = deps.credentials.newKey();
  const conta = await deps.api.criarConta(chave);
  const cred = { conta, chave };
  await deps.credentials.save(cred);
  return cred;
}

function markSent(store: EngineStore, path: string) {
  store.update((st) => ({ sync: { ...st.sync, enviados: { ...st.sync.enviados, [path]: true } } }));
}

export async function runSync(deps: EngineDeps): Promise<SyncOutcome> {
  const { store, api, media } = deps;
  const outcome: SyncOutcome = { sent: 0, received: 0, uploaded: 0, downloaded: 0 };
  if (!store.get().sync.ligado) return outcome;

  const cred = await ensureAccount(deps);

  // 1. Arquivos primeiro: quando o registro chegar no outro celular, o arquivo já está lá.
  for (const path of ownMediaPaths(store.get())) {
    if (store.get().sync.enviados[path] || !media.exists(path)) continue;
    await media.upload(cred, path);
    markSent(store, path);
    outcome.uploaded += 1;
  }

  // 2. Registros: envia a fila em lotes e recebe tudo o que mudou desde o cursor.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const st = store.get();
    const batch = buildOutgoing(st);
    const res = await api.sincronizar(cred, st.sync.cursor, batch.records);
    store.update((now) => {
      const merged = mergeRemote(now, res.mudancas);
      outcome.received += merged.applied;
      return {
        ...merged.state,
        pendingChanges: acknowledge(merged.state.pendingChanges, [...batch.changeIds, ...batch.dropped]),
        sync: { ...now.sync, cursor: Math.max(now.sync.cursor, res.seq) },
      };
    });
    outcome.sent += batch.records.length;
    const more = res.tem_mais || buildOutgoing(store.get()).records.length > 0;
    if (!more) break;
  }

  // 3. Arquivos que vieram de outro celular e ainda não estão neste.
  for (const path of ownMediaPaths(store.get())) {
    if (media.exists(path)) continue;
    try {
      await media.download(cred, path);
      markSent(store, path);
      outcome.downloaded += 1;
    } catch (e) {
      // Sem internet ou chave errada: interrompe a rodada. Arquivo que não existe
      // no servidor (ainda não enviado pelo outro celular) fica para a próxima.
      if (e instanceof SyncError && (e.kind === 'rede' || e.kind === 'chave')) throw e;
    }
  }
  return outcome;
}

/** Espera antes de tentar de novo depois de `failures` erros seguidos: 5 s, 10 s, 20 s... até 5 min. */
export function backoffDelay(failures: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, failures - 1), 300_000);
}
