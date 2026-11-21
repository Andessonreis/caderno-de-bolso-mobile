// Liga o motor da cópia na internet ao app: quando rodar, o estado que as
// telas mostram e as ações de ligar outro celular e apagar a cópia. Liga
// também o envio das visitas para o grupo, que corre à parte (um não espera
// nem trava o outro). Nada aqui bloqueia a interface: tudo roda em segundo plano.

import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useApp } from '@/store';

import { SyncApi, SyncError } from './api';
import { serviceConfig } from './config';
import { credentialStore, createMediaTransport, SYNC_AVAILABLE } from './device';
import { backoffDelay, type EngineDeps, type SyncOutcome, runSync } from './engine';
import { canSendToGroup, type GroupDeps, type GroupOutcome, runGroupSend } from './grupo';
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
      if (online && was !== true) {
        requestSync();
        requestGroupSend();
      }
      if (!online && useSyncStatus.getState().fase !== 'chave') useSyncStatus.setState({ fase: 'sem_internet' });
      const faseGrupo = useGroupStatus.getState().fase;
      if (!online && faseGrupo !== 'nao_encontrado' && faseGrupo !== 'cheio') useGroupStatus.setState({ fase: 'sem_internet' });
    };
    Network.getNetworkStateAsync().then(setOnline, () => undefined);
    const net = Network.addNetworkStateListener(setOnline);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        requestSync();
        requestGroupSend();
      }
    });
    const unsub = useApp.subscribe((s, prev) => {
      const last = s.pendingChanges.at(-1)?.id;
      if (last && last !== prev.pendingChanges.at(-1)?.id) requestSync(DEBOUNCE_MS);
      if (s.peerVisits !== prev.peerVisits) requestGroupSend(DEBOUNCE_MS);
    });
    requestSync();
    requestGroupSend();
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

// ---------- Envio das visitas para o grupo ----------

/**
 * `nao_encontrado`: o código não vale mais (grupo apagado ou código errado). O envio para até entrar de novo.
 * `cheio`: o grupo chegou ao limite. Visita nova só vai quando o produtor tocar em "Tentar de novo"
 * (ou o app abrir de novo); correções e exclusões de visitas que o grupo já tem continuam indo.
 */
export type GroupPhase = 'parado' | 'enviando' | 'sem_internet' | 'erro' | 'nao_encontrado' | 'cheio';

export const useGroupStatus = create<{ fase: GroupPhase }>(() => ({ fase: 'parado' }));

const groupDeps: GroupDeps = {
  api,
  store: {
    get: () => useApp.getState(),
    markSent: (codigo, sent) => useApp.getState().markSentToGroup(codigo, sent),
    markRejected: (codigo, rejected) => useApp.getState().markRejectedByGroup(codigo, rejected),
  },
};

let groupCurrent: Promise<GroupOutcome | null> = Promise.resolve(null);
let groupRunning = false;
let groupFailures = 0;
let groupTimer: ReturnType<typeof setTimeout> | null = null;
/** O grupo avisou que está cheio: as rodadas automáticas levam só correções e exclusões. */
let groupFull = false;

function canRunGroup(): boolean {
  const st = useApp.getState();
  return SYNC_AVAILABLE && st.hydrated && canSendToGroup(st) && useGroupStatus.getState().fase !== 'nao_encontrado';
}

async function executeGroup(): Promise<GroupOutcome | null> {
  if (!canRunGroup()) return null;
  groupRunning = true;
  useGroupStatus.setState({ fase: 'enviando' });
  try {
    const out = await runGroupSend(groupDeps, { full: groupFull });
    groupFailures = 0;
    groupFull = out.full;
    useGroupStatus.setState({ fase: groupFull ? 'cheio' : 'parado' });
    return out;
  } catch (e) {
    const kind = e instanceof SyncError ? e.kind : 'servidor';
    if (kind === 'chave') {
      // Grupo apagado ou código errado: não insiste nem apaga nada; a tela pede o código de novo.
      useGroupStatus.setState({ fase: 'nao_encontrado' });
      return null;
    }
    groupFailures += 1;
    useGroupStatus.setState({ fase: kind === 'rede' ? 'sem_internet' : 'erro' });
    scheduleGroup(backoffDelay(groupFailures));
    return null;
  } finally {
    groupRunning = false;
  }
}

function scheduleGroup(delay: number) {
  if (groupTimer) clearTimeout(groupTimer);
  groupTimer = setTimeout(() => {
    groupTimer = null;
    requestGroupSend();
  }, delay);
}

/** Pede um envio para o grupo (agora ou depois de `delay`). Pedidos repetidos se juntam. */
export function requestGroupSend(delay = 0): void {
  if (!canRunGroup()) return;
  if (delay > 0) {
    scheduleGroup(delay);
    return;
  }
  if (groupRunning) {
    scheduleGroup(DEBOUNCE_MS);
    return;
  }
  groupCurrent = groupCurrent.then(executeGroup, executeGroup);
}

/** Envia agora e espera terminar. */
export async function sendToGroupNow(): Promise<GroupOutcome | null> {
  await groupCurrent.catch(() => null);
  groupCurrent = executeGroup();
  return groupCurrent;
}

/** "Tentar de novo" com o grupo cheio: tenta também as visitas novas. */
export async function retryGroupSend(): Promise<GroupOutcome | null> {
  // Um envio que já estava no caminho termina antes, para não marcar "cheio" de novo por cima.
  await groupCurrent.catch(() => null);
  groupFull = false;
  groupFailures = 0;
  useGroupStatus.setState({ fase: 'parado' });
  return sendToGroupNow();
}

export type GroupCheck = { ok: true; nome: string } | { ok: false; motivo: 'nao_encontrado' | 'sem_internet' | 'erro' };

/** Confere o código no servidor (precisa de internet) e devolve o nome do grupo. */
export async function checkGroup(codigo: string): Promise<GroupCheck> {
  try {
    return { ok: true, nome: await api.grupoConferir(codigo) };
  } catch (e) {
    if (e instanceof SyncError && e.kind === 'chave') return { ok: false, motivo: 'nao_encontrado' };
    if (e instanceof SyncError && e.kind === 'rede') return { ok: false, motivo: 'sem_internet' };
    return { ok: false, motivo: 'erro' };
  }
}

/** Entra no grupo (código já conferido) e começa a enviar as visitas. */
export function enterGroup(codigo: string, nome: string): void {
  useApp.getState().joinGroup(codigo, nome);
  groupFailures = 0;
  groupFull = false;
  useGroupStatus.setState({ fase: 'parado' });
  requestGroupSend();
}

/** Para de enviar para o grupo. O que já foi enviado continua com o grupo. */
export function leaveGroup(): void {
  useApp.getState().leaveGroup();
  if (groupTimer) clearTimeout(groupTimer);
  groupTimer = null;
  groupFailures = 0;
  groupFull = false;
  useGroupStatus.setState({ fase: 'parado' });
}
