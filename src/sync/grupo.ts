// Motor do envio das visitas para o grupo. Independe da cópia na internet: o
// produtor que entrou num grupo aceitou enviar as visitas, mesmo com a cópia
// desligada. Uma rodada envia, em lotes, o que mudou desde o último envio.
// Repetir não duplica nada (vale a alteração mais recente no servidor).

import { type EnviadasAoGrupo, type Grupo, MAX_LOTE_GRUPO, type VisitaParaGrupo, visitasParaEnviar } from '@/lib/grupo';
import type { Visita } from '@/lib/roteiro';
import type { Profile } from '@/lib/types';

import type { SyncApi } from './api';

export interface GroupState {
  profile: Profile | null;
  peerVisits: Visita[];
  grupo: Grupo | null;
  grupoEnviadas: EnviadasAoGrupo;
}

export interface GroupDeps {
  store: {
    get(): GroupState;
    /** Registra o que o grupo aceitou (ignora se o grupo mudou no meio do caminho). */
    markSent(codigo: string, sent: VisitaParaGrupo[]): void;
  };
  api: Pick<SyncApi, 'grupoEnviar'>;
}

export interface GroupOutcome {
  sent: number;
  /** Visitas que ficaram de fora por serem grandes demais. */
  tooBig: number;
}

/** Limite de lotes por rodada (proteção contra laço sem fim). */
const MAX_ROUNDS = 120;

/** Dados de exemplo nunca vão para o grupo. */
export function canSendToGroup(st: GroupState): boolean {
  return st.grupo !== null && !st.profile?.exemplo;
}

export async function runGroupSend(deps: GroupDeps): Promise<GroupOutcome> {
  const outcome: GroupOutcome = { sent: 0, tooBig: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const st = deps.store.get();
    if (!st.grupo || !canSendToGroup(st)) break;
    const sel = visitasParaEnviar(st.peerVisits, st.grupoEnviadas);
    outcome.tooBig = sel.grandes.length;
    const lote = sel.enviar.slice(0, MAX_LOTE_GRUPO);
    if (lote.length === 0) break;
    const { codigo } = st.grupo;
    await deps.api.grupoEnviar(codigo, lote);
    deps.store.markSent(codigo, lote);
    outcome.sent += lote.length;
  }
  return outcome;
}
