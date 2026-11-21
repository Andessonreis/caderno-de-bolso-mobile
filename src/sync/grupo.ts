// Motor do envio das visitas para o grupo. Independe da cópia na internet: o
// produtor que entrou num grupo aceitou enviar as visitas, mesmo com a cópia
// desligada. Uma rodada envia, em lotes, o que mudou desde o último envio.
// Repetir não duplica nada (vale a alteração mais recente no servidor).

import {
  type EnviadasAoGrupo,
  type Grupo,
  MAX_LOTE_GRUPO,
  type RecusadasPeloGrupo,
  type VisitaParaGrupo,
  visitasParaEnviar,
} from '@/lib/grupo';
import type { Visita } from '@/lib/roteiro';
import type { Profile } from '@/lib/types';

import { type SyncApi, SyncError } from './api';

export interface GroupState {
  profile: Profile | null;
  peerVisits: Visita[];
  grupo: Grupo | null;
  grupoEnviadas: EnviadasAoGrupo;
  grupoRecusadas: RecusadasPeloGrupo;
}

export interface GroupDeps {
  store: {
    get(): GroupState;
    /** Registra o que o grupo aceitou (ignora se o grupo mudou no meio do caminho). */
    markSent(codigo: string, sent: VisitaParaGrupo[]): void;
    /** Registra o que o grupo recusou (ignora se o grupo mudou no meio do caminho). */
    markRejected(codigo: string, rejected: VisitaParaGrupo[]): void;
  };
  api: Pick<SyncApi, 'grupoEnviar'>;
}

export interface GroupOutcome {
  sent: number;
  /** Visitas que ficaram de fora por serem grandes demais. */
  tooBig: number;
  /** Visitas que o servidor recusou (ficam de fora até mudarem). */
  rejected: number;
  /** O grupo chegou ao limite: visita nova não entra, só correções e exclusões. */
  full: boolean;
}

/** Limite de lotes por rodada (proteção contra laço sem fim). */
const MAX_ROUNDS = 120;

/** Dados de exemplo nunca vão para o grupo. */
export function canSendToGroup(st: GroupState): boolean {
  return st.grupo !== null && !st.profile?.exemplo;
}

/** O servidor recusou alguma visita do lote (estragada ou grande demais). */
function isRejection(e: unknown): boolean {
  return (
    e instanceof SyncError &&
    (e.serverMessage === 'visitas_invalidas' || e.serverMessage === 'registro_grande_demais')
  );
}

/** O grupo não aceita mais visitas novas. */
function isFull(e: unknown): boolean {
  return e instanceof SyncError && e.serverMessage === 'limite_de_registros';
}

/**
 * Envia para o grupo o que mudou. Lote recusado é reenviado visita por visita:
 * a que o servidor recusar sozinha fica de fora (até mudar) sem travar as outras.
 * Grupo cheio (`full`, ou quando o servidor avisa): só vão correções e exclusões
 * de visitas que o grupo já tem, que o servidor continua aceitando.
 */
export async function runGroupSend(deps: GroupDeps, opts: { full?: boolean } = {}): Promise<GroupOutcome> {
  const outcome: GroupOutcome = { sent: 0, tooBig: 0, rejected: 0, full: Boolean(opts.full) };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const st = deps.store.get();
    if (!st.grupo || !canSendToGroup(st)) break;
    const sel = visitasParaEnviar(st.peerVisits, st.grupoEnviadas, st.grupoRecusadas);
    outcome.tooBig = sel.grandes.length;
    outcome.rejected = sel.recusadas.length;
    const candidatas = outcome.full ? sel.enviar.filter((r) => !sel.novas.has(r.id)) : sel.enviar;
    const lote = candidatas.slice(0, MAX_LOTE_GRUPO);
    if (lote.length === 0) break;
    const { codigo } = st.grupo;
    try {
      await deps.api.grupoEnviar(codigo, lote);
      deps.store.markSent(codigo, lote);
      outcome.sent += lote.length;
    } catch (e) {
      if (isRejection(e)) await sendOneByOne(deps, codigo, lote, outcome);
      // Cheio: a próxima volta leva só o que o grupo já tem. Se o lote já era só
      // isso, não há o que separar e o erro segue (espera e tenta depois).
      else if (isFull(e) && !outcome.full) outcome.full = true;
      else throw e;
    }
  }
  return outcome;
}

async function sendOneByOne(deps: GroupDeps, codigo: string, lote: VisitaParaGrupo[], outcome: GroupOutcome) {
  for (const r of lote) {
    // Com o grupo cheio, visita nova nem tenta: o servidor recusaria.
    if (outcome.full && !deps.store.get().grupoEnviadas[r.id]) continue;
    try {
      await deps.api.grupoEnviar(codigo, [r]);
      deps.store.markSent(codigo, [r]);
      outcome.sent += 1;
    } catch (e) {
      if (isRejection(e)) {
        deps.store.markRejected(codigo, [r]);
        outcome.rejected += 1;
      } else if (isFull(e)) outcome.full = true;
      else throw e;
    }
  }
}
