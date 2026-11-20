// Liga o motor da cópia na internet ao app: quando rodar, o estado que as
// telas mostram e as ações de ligar outro celular e apagar a cópia.
// Nada aqui bloqueia a interface: tudo roda em segundo plano.

import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useApp } from '@/store';

import { SyncApi, SyncError } from './api';
import { serviceConfig } from './config';
import { credentialStore, createMediaTransport, SYNC_AVAILABLE } from './device';
import { backoffDelay, type EngineDeps, type SyncOutcome, runSync } from './engine';
import type { Credentials } from './links';

export type SyncPhase = 'parado' | 'enviando' | 'sem_internet' | 'erro' | 'chave';

interface SyncStatus {
  fase: SyncPhase;
  /** null enquanto não sabemos. */
  online: boolean | null;
  /** Última rodada concluída (ISO). */
  ultimaVez?: string;
}

export const useSyncStatus = create<SyncStatus>(() => ({ fase: 'parado', online: null }));

const api = new SyncApi(serviceConfig());

const deps: EngineDeps = {
  api,
  media: createMediaTransport(api),
  credentials: credentialStore,
  store: {
    get: () => useApp.getState(),
    update: (fn) => useApp.setState((st) => fn(st)),
  },
};

/** Espera depois de salvar algo, para juntar várias alterações num envio só. */
const DEBOUNCE_MS = 4_000;

let current: Promise<SyncOutcome | null> = Promise.resolve(null);
let running = false;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function canRun(): boolean {
  return SYNC_AVAILABLE && useApp.getState().hydrated && useApp.getState().sync.ligado && useSyncStatus.getState().fase !== 'chave';
}

async function execute(): Promise<SyncOutcome | null> {
  if (!canRun()) return null;
  running = true;
  useSyncStatus.setState({ fase: 'enviando' });
  try {
    const out = await runSync(deps);
    failures = 0;
    useSyncStatus.setState({ fase: 'parado', ultimaVez: new Date().toISOString() });
    return out;
  } catch (e) {
    const kind = e instanceof SyncError ? e.kind : 'servidor';
    if (kind === 'chave') {
      // Não tenta de novo nem mexe nos dados: o produtor precisa ligar o celular de novo.
      useSyncStatus.setState({ fase: 'chave' });
      return null;
    }
    failures += 1;
    useSyncStatus.setState({ fase: kind === 'rede' ? 'sem_internet' : 'erro' });
    schedule(backoffDelay(failures));
    return null;
  } finally {
    running = false;
  }
}

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    requestSync();
  }, delay);
}

/** Pede uma rodada (agora ou depois de `delay`). Pedidos repetidos se juntam. */
export function requestSync(delay = 0): void {
  if (!canRun()) return;
  if (delay > 0) {
    schedule(delay);
    return;
  }
  if (running) {
    schedule(DEBOUNCE_MS);
    return;
  }
  current = current.then(execute, execute);
}

/** Roda uma rodada e espera terminar (usado ao ligar outro celular). */
export async function syncNow(): Promise<SyncOutcome | null> {
  await current.catch(() => null);
  current = execute();
  return current;
}

/** Dispara a cópia ao abrir o app, ao voltar a internet, ao voltar para o app e depois de salvar algo. */
export function useSyncTriggers(): void {
  const hydrated = useApp((s) => s.hydrated);
  const ligado = useApp((s) => s.sync.ligado);

  useEffect(() => {
    if (!SYNC_AVAILABLE || !hydrated) return;
    const setOnline = (s: Network.NetworkState) => {
      const online = Boolean(s.isConnected) && s.isInternetReachable !== false;
      const was = useSyncStatus.getState().online;
      useSyncStatus.setState({ online });
      if (online && was !== true) requestSync();
      if (!online && useSyncStatus.getState().fase !== 'chave') useSyncStatus.setState({ fase: 'sem_internet' });
    };
    Network.getNetworkStateAsync().then(setOnline, () => undefined);
    const net = Network.addNetworkStateListener(setOnline);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') requestSync();
    });
    const unsub = useApp.subscribe((s, prev) => {
      const last = s.pendingChanges.at(-1)?.id;
      if (last && last !== prev.pendingChanges.at(-1)?.id) requestSync(DEBOUNCE_MS);
    });
    requestSync();
    return () => {
      net.remove();
      app.remove();
      unsub();
    };
  }, [hydrated, ligado]);
}

/** Conta e chave deste celular, para mostrar no QR de "ligar outro celular". */
export function loadCredentials(): Promise<Credentials | null> {
  return credentialStore.load();
}

export type LinkResult = 'ok' | 'nao_confere' | 'sem_internet';

/**
 * Liga este celular a um caderno que já está na internet: confere a chave,
 * guarda, junta o que já existe aqui e baixa tudo.
 */
export async function linkToAccount(c: Credentials): Promise<LinkResult> {
  let ok: boolean;
  try {
    ok = await api.chaveConfere(c);
  } catch (e) {
    return e instanceof SyncError && e.kind !== 'rede' ? 'nao_confere' : 'sem_internet';
  }
  if (!ok) return 'nao_confere';
  await credentialStore.save(c);
  failures = 0;
  useSyncStatus.setState({ fase: 'parado' });
  useApp.getState().resetSyncProgress();
  useApp.getState().setSyncEnabled(true);
  await syncNow();
  return useSyncStatus.getState().fase === 'sem_internet' ? 'sem_internet' : 'ok';
}

/** Para de guardar na internet (a cópia que já está lá continua). */
export function stopSync(): void {
  useApp.getState().setSyncEnabled(false);
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Apaga a cópia da internet (arquivos e registros) e desliga. Os dados do celular ficam. */
export async function deleteCloudCopy(): Promise<'ok' | 'sem_internet' | 'erro'> {
  const cred = await credentialStore.load();
  try {
    if (cred) await api.apagarTudo(cred);
  } catch (e) {
    if (!(e instanceof SyncError && e.kind === 'chave')) return e instanceof SyncError && e.kind === 'rede' ? 'sem_internet' : 'erro';
  }
  await credentialStore.clear();
  stopSync();
  useApp.getState().resetSyncProgress();
  useSyncStatus.setState({ fase: 'parado' });
  return 'ok';
}
