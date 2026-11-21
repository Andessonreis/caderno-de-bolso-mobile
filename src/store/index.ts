import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import {
  type Change,
  type EntityKind,
  enqueue,
  findLive,
  SINGLETON_IDS,
  live,
  markAccepted,
  patchMany,
  softDelete,
  undelete,
  upsert,
} from '@/data/repository';
import { BACKUP_VERSION, type BackupData } from '@/lib/backup';
import type { EnviadasAoGrupo, Grupo, RecusadasPeloGrupo, VisitaParaGrupo } from '@/lib/grupo';
import { uuid } from '@/lib/ids';
import { initialChanges, migratePersisted, STORAGE_VERSION } from '@/lib/migrate';
import type { Visita } from '@/lib/roteiro';
import { buildSampleData, removeSampleData } from '@/lib/sample';
import type { Area, Entry, FontSizeChoice, ISODate, ManualCheckId, NotebookPhoto, Profile } from '@/lib/types';
import { bumpUsage } from '@/lib/usage';

/** Novo id estável (UUID v4). */
export function newId(): string {
  return uuid();
}

let lastStamp = 0;

/**
 * Hora da alteração, sempre maior que a da alteração anterior. Duas gravações no
 * mesmo milissegundo teriam a mesma hora, e a segunda seria ignorada na junção
 * com a internet, onde só vale a alteração mais recente.
 */
function nowISO(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export interface AppData {
  profile: Profile | null;
  /** Inclui registros apagados (com `deletedAt`). Use `useAreas()` para os ativos. */
  areas: Area[];
  crops: string[];
  /** Inclui registros apagados (com `deletedAt`). Use `useEntries()` para os ativos. */
  entries: Entry[];
  /** Inclui registros apagados (com `deletedAt`). Use `usePhotos()` para os ativos. */
  photos: NotebookPhoto[];
  /**
   * Visitas feitas à roça de outros produtores (roteiro de visita). Inclui as
   * apagadas (com `deletedAt`). Use `usePeerVisits()` para as ativas.
   */
  peerVisits: Visita[];
  manualChecks: Partial<Record<ManualCheckId, boolean>>;
  lastVisitDate?: ISODate;
  lastExportAt?: ISODate;
  lastAreaId?: string;
  cropUsage: Record<string, number>;
  fontSize: FontSizeChoice;
  /** Alterações ainda não enviadas para a cópia na internet. */
  pendingChanges: Change[];
  /** Data da última alteração da lista de culturas (registro único). */
  culturasUpdatedAt?: string;
  /** Data da última alteração dos itens marcados e da data da visita (registro único). */
  visitaUpdatedAt?: string;
  /** Cópia na internet. A conta e a chave ficam no armazenamento seguro, não aqui. */
  sync: SyncConfig;
  /** Grupo que recebe as visitas a outras roças. null = não envia para grupo nenhum. */
  grupo: Grupo | null;
  /**
   * Visitas que o grupo `grupoEnviadasDe` já aceitou: id → `updatedAt` da versão
   * aceita. Fica guardado ao sair do grupo, para que voltar ao mesmo grupo leve as
   * alterações e exclusões feitas fora dele.
   */
  grupoEnviadas: EnviadasAoGrupo;
  /** Código do grupo a que `grupoEnviadas` se refere. null = nenhum. */
  grupoEnviadasDe: string | null;
  /** Visitas que o servidor do grupo recusou: ficam de fora até mudarem. */
  grupoRecusadas: RecusadasPeloGrupo;
}

export interface SyncConfig {
  /** O produtor aceitou guardar uma cópia na internet. */
  ligado: boolean;
  /** Já perguntamos uma vez (não insistir a cada abertura). */
  perguntado: boolean;
  /** Último `seq` recebido do servidor. */
  cursor: number;
  /** Arquivos de mídia já enviados (caminho relativo). */
  enviados: Record<string, true>;
}

interface AppActions {
  completeOnboarding: (profile: Profile, areas: Area[], crops: string[]) => void;
  loadSample: (today: ISODate) => void;
  /** Apaga o que veio dos dados de exemplo. Quem chama apaga os arquivos de mídia devolvidos. */
  removeSample: () => { wasSampleProfile: boolean; removedMedia: string[] };
  updateProfile: (profile: Profile) => void;
  addArea: (name: string) => void;
  renameArea: (id: string, name: string) => void;
  removeArea: (id: string) => void;
  setCrops: (crops: string[]) => void;
  addEntry: (entry: Entry) => void;
  updateEntry: (entry: Entry) => void;
  /** Apaga (soft delete) e devolve a anotação como estava. */
  deleteEntry: (id: string) => Entry | undefined;
  /** Desfaz o apagamento (botão "Desfazer"). */
  restoreEntry: (id: string) => void;
  setCopied: (ids: string[], copied: boolean) => void;
  addPhoto: (photo: Omit<NotebookPhoto, 'updatedAt'>) => void;
  updatePhoto: (id: string, caption: string) => void;
  removePhoto: (id: string) => void;
  /** Cria ou atualiza uma visita do roteiro. Cada mudança na tela passa por aqui e é salva na hora. */
  savePeerVisit: (visit: Visita) => void;
  /** Apaga (soft delete) e devolve a visita como estava. */
  deletePeerVisit: (id: string) => Visita | undefined;
  /** Desfaz o apagamento (botão "Desfazer"). */
  restorePeerVisit: (id: string) => void;
  setManualCheck: (id: ManualCheckId, value: boolean) => void;
  setLastVisitDate: (date: ISODate | undefined) => void;
  /** Desmarca os itens que o produtor marca à mão (nova visita). */
  resetManualChecks: () => void;
  setFontSize: (size: FontSizeChoice) => void;
  markExported: (date: ISODate) => void;
  /**
   * Troca os dados pelos do arquivo; o grupo do aparelho fica como está.
   * `keepPhotos`: mantém as fotos do caderno atuais (arquivo antigo, sem fotos).
   */
  importData: (data: BackupData, keepPhotos?: boolean) => void;
  /** Liga ou desliga a cópia na internet. */
  setSyncEnabled: (ligado: boolean) => void;
  /** Registra que a pergunta sobre a cópia na internet já foi feita. */
  setSyncAsked: () => void;
  /** Esquece o que foi enviado e põe tudo do produtor de novo na fila (cópia apagada ou caderno trocado). */
  resetSyncProgress: () => void;
  /** Passa a enviar as visitas para o grupo (código já conferido no servidor). */
  joinGroup: (codigo: string, nome: string) => void;
  /** Para de enviar para o grupo. O que já foi enviado continua com o grupo. */
  leaveGroup: () => void;
  /** Registra as visitas que o grupo aceitou (só se o grupo ainda for o mesmo). */
  markSentToGroup: (codigo: string, sent: VisitaParaGrupo[]) => void;
  /** Registra as visitas que o grupo recusou (só se o grupo ainda for o mesmo). */
  markRejectedByGroup: (codigo: string, rejected: VisitaParaGrupo[]) => void;
  resetAll: () => void;
}

interface HydrationState {
  hydrated: boolean;
}

export type AppState = AppData & AppActions & HydrationState;

const initialData: AppData = {
  profile: null,
  areas: [],
  crops: [],
  entries: [],
  photos: [],
  peerVisits: [],
  manualChecks: {},
  cropUsage: {},
  fontSize: 'normal',
  pendingChanges: [],
  sync: { ligado: false, perguntado: false, cursor: 0, enviados: {} },
  grupo: null,
  grupoEnviadas: {},
  grupoEnviadasDe: null,
  grupoRecusadas: {},
};

/**
 * Registra a alteração na fila de sincronização. Dados de exemplo nunca entram
 * na fila: eles existem só para demonstração.
 */
function track(
  queue: Change[],
  entity: EntityKind,
  record: { id: string; exemplo?: boolean } | null,
  op: Change['op'] = 'upsert',
): Change[] {
  if (!record || record.exemplo) return queue;
  return enqueue(queue, { entity, recordId: record.id, op, at: nowISO() }, newId);
}

const PERFIL = { id: SINGLETON_IDS.perfil };
const CULTURAS = { id: SINGLETON_IDS.culturas };
const VISITA = { id: SINGLETON_IDS.visita };

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData,
      hydrated: false,

      completeOnboarding: (profile, areas, crops) =>
        // Junta com o que já existir (ex.: áreas criadas enquanto o exemplo estava carregado).
        set((st) => {
          const now = nowISO();
          let queue = track(st.pendingChanges, 'perfil', PERFIL);
          queue = track(queue, 'culturas', CULTURAS);
          queue = track(queue, 'visita', VISITA);
          let list = st.areas;
          for (const a of areas) {
            list = upsert(list, a, now);
            queue = track(queue, 'area', a);
          }
          return {
            profile: { ...profile, updatedAt: now },
            areas: list,
            crops: [...new Set([...st.crops, ...crops])],
            culturasUpdatedAt: now,
            visitaUpdatedAt: now,
            pendingChanges: queue,
          };
        }),

      loadSample: (today) => {
        const s = buildSampleData(today);
        set((st) => ({
          profile: s.profile,
          areas: [...s.areas, ...st.areas.filter((a) => !a.exemplo)],
          crops: [...new Set([...s.crops, ...st.crops])],
          entries: [...s.entries, ...st.entries.filter((e) => !e.exemplo)],
          lastAreaId: s.areas[0].id,
        }));
      },

      removeSample: () => {
        const { state, removedMedia, wasSampleProfile, promotedAreaIds } = removeSampleData(get());
        set((st) => {
          let queue = st.pendingChanges;
          for (const id of promotedAreaIds) queue = track(queue, 'area', { id });
          return { ...state, pendingChanges: queue };
        });
        return { wasSampleProfile, removedMedia };
      },

      updateProfile: (profile) =>
        set((st) => {
          const next = { ...profile, updatedAt: nowISO() };
          return { profile: next, pendingChanges: track(st.pendingChanges, 'perfil', { ...PERFIL, exemplo: next.exemplo }) };
        }),

      addArea: (name) =>
        set((st) => {
          const area: Area = { id: newId(), name: name.trim(), updatedAt: nowISO() };
          return { areas: upsert(st.areas, area, area.updatedAt), pendingChanges: track(st.pendingChanges, 'area', area) };
        }),

      renameArea: (id, name) =>
        set((st) => {
          const area = findLive(st.areas, id);
          if (!area) return st;
          return {
            areas: upsert(st.areas, { ...area, name: name.trim() }, nowISO()),
            pendingChanges: track(st.pendingChanges, 'area', area),
          };
        }),

      removeArea: (id) =>
        set((st) => ({
          areas: softDelete(st.areas, id, nowISO()),
          lastAreaId: st.lastAreaId === id ? undefined : st.lastAreaId,
          pendingChanges: track(st.pendingChanges, 'area', st.areas.find((a) => a.id === id) ?? null, 'delete'),
        })),

      setCrops: (crops) =>
        set((st) => ({
          crops,
          culturasUpdatedAt: nowISO(),
          pendingChanges: track(st.pendingChanges, 'culturas', { ...CULTURAS, exemplo: st.profile?.exemplo }),
        })),

      addEntry: (entry) =>
        set((st) => ({
          entries: upsert(st.entries, entry, nowISO()),
          lastAreaId: entry.areaId,
          cropUsage: bumpUsage(st.cropUsage, entry.crop),
          pendingChanges: track(st.pendingChanges, 'anotacao', entry),
        })),

      updateEntry: (entry) =>
        set((st) => ({
          entries: upsert(st.entries, entry, nowISO()),
          pendingChanges: track(st.pendingChanges, 'anotacao', entry),
        })),

      deleteEntry: (id) => {
        const found = findLive(get().entries, id);
        if (!found) return undefined;
        set((st) => ({
          entries: softDelete(st.entries, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'anotacao', found, 'delete'),
        }));
        return found;
      },

      restoreEntry: (id) =>
        set((st) => ({
          entries: undelete(st.entries, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'anotacao', st.entries.find((e) => e.id === id) ?? null),
        })),

      setCopied: (ids, copied) =>
        set((st) => {
          const wanted = new Set(ids);
          let queue = st.pendingChanges;
          for (const e of st.entries) if (wanted.has(e.id)) queue = track(queue, 'anotacao', e);
          return { entries: patchMany(st.entries, wanted, { copied }, nowISO()), pendingChanges: queue };
        }),

      addPhoto: (photo) =>
        set((st) => {
          const now = nowISO();
          return {
            photos: [{ ...photo, updatedAt: now }, ...st.photos],
            pendingChanges: track(st.pendingChanges, 'pagina', photo),
          };
        }),

      updatePhoto: (id, caption) =>
        set((st) => {
          const photo = findLive(st.photos, id);
          if (!photo) return st;
          return {
            photos: upsert(st.photos, { ...photo, caption: caption.trim() || undefined }, nowISO()),
            pendingChanges: track(st.pendingChanges, 'pagina', photo),
          };
        }),

      removePhoto: (id) =>
        set((st) => ({
          photos: softDelete(st.photos, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'pagina', { id }, 'delete'),
        })),

      savePeerVisit: (visit) =>
        set((st) => ({
          peerVisits: upsert(st.peerVisits, visit, nowISO()),
          pendingChanges: track(st.pendingChanges, 'visita_par', visit),
        })),

      deletePeerVisit: (id) => {
        const found = findLive(get().peerVisits, id);
        if (!found) return undefined;
        set((st) => ({
          peerVisits: softDelete(st.peerVisits, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'visita_par', found, 'delete'),
        }));
        return found;
      },

      restorePeerVisit: (id) =>
        set((st) => ({
          peerVisits: undelete(st.peerVisits, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'visita_par', st.peerVisits.find((v) => v.id === id) ?? null),
        })),

      setManualCheck: (id, value) =>
        set((st) => ({
          manualChecks: { ...st.manualChecks, [id]: value },
          visitaUpdatedAt: nowISO(),
          pendingChanges: track(st.pendingChanges, 'visita', { ...VISITA, exemplo: st.profile?.exemplo }),
        })),

      setLastVisitDate: (date) =>
        set((st) => ({
          lastVisitDate: date,
          visitaUpdatedAt: nowISO(),
          pendingChanges: track(st.pendingChanges, 'visita', { ...VISITA, exemplo: st.profile?.exemplo }),
        })),

      resetManualChecks: () =>
        set((st) => ({
          manualChecks: {},
          visitaUpdatedAt: nowISO(),
          pendingChanges: track(st.pendingChanges, 'visita', { ...VISITA, exemplo: st.profile?.exemplo }),
        })),

      setFontSize: (fontSize) => set({ fontSize }),

      markExported: (date) => set({ lastExportAt: date }),

      importData: (data, keepPhotos = false) => {
        const now = nowISO();
        const deps = { newId, now };
        const imported = {
          profile: data.profile,
          areas: data.areas,
          crops: data.crops,
          entries: data.entries,
          photos: keepPhotos ? get().photos : data.photos,
          // Arquivo feito antes do roteiro de visita: as visitas do aparelho continuam.
          peerVisits: data.peerVisits ?? get().peerVisits,
          manualChecks: data.manualChecks,
          lastVisitDate: data.lastVisitDate,
        };
        // O grupo do aparelho não muda: entrar em outro grupo (ou sair) é sempre
        // escolha do produtor, com a confirmação da tela do grupo.
        set((st) => ({
          ...imported,
          lastAreaId: undefined,
          culturasUpdatedAt: now,
          visitaUpdatedAt: now,
          pendingChanges: initialChanges(imported, deps),
          // Os arquivos importados ainda não estão na cópia na internet.
          sync: { ...st.sync, enviados: {} },
        }));
      },

      setSyncEnabled: (ligado) => set((st) => ({ sync: { ...st.sync, ligado, perguntado: true } })),

      setSyncAsked: () => set((st) => ({ sync: { ...st.sync, perguntado: true } })),

      resetSyncProgress: () =>
        set((st) => ({
          sync: { ...st.sync, cursor: 0, enviados: {} },
          pendingChanges: initialChanges(st as unknown as Record<string, unknown>, { newId, now: nowISO() }),
        })),

      joinGroup: (codigo, nome) =>
        set((st) => {
          // Mesmo grupo (código digitado de novo, ou voltou depois de sair): o que ele
          // já aceitou continua valendo, e as exclusões feitas fora dele vão agora.
          const mesmo = st.grupoEnviadasDe === codigo;
          return {
            grupo: { codigo, nome, ligadoEm: nowISO() },
            grupoEnviadas: mesmo ? st.grupoEnviadas : {},
            grupoEnviadasDe: codigo,
            grupoRecusadas: mesmo ? st.grupoRecusadas : {},
          };
        }),

      // `grupoEnviadas` fica: voltar ao mesmo grupo não reenvia tudo e leva as exclusões.
      leaveGroup: () => set({ grupo: null, grupoRecusadas: {} }),

      markSentToGroup: (codigo, sent) =>
        set((st) => {
          // Saiu do grupo (ou trocou) enquanto o envio estava no caminho: não registra.
          if (st.grupo?.codigo !== codigo) return st;
          const grupoRecusadas = { ...st.grupoRecusadas };
          for (const r of sent) delete grupoRecusadas[r.id];
          return { grupoEnviadas: markAccepted(st.grupoEnviadas, sent), grupoEnviadasDe: codigo, grupoRecusadas };
        }),

      markRejectedByGroup: (codigo, rejected) =>
        set((st) => {
          if (st.grupo?.codigo !== codigo) return st;
          return { grupoRecusadas: markAccepted(st.grupoRecusadas, rejected) };
        }),

      resetAll: () => set({ ...initialData }),
    }),
    {
      name: 'caderno-de-bolso',
      version: STORAGE_VERSION,
      migrate: (persisted, version) => migratePersisted(persisted, version) as AppData,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (st): AppData => ({
        profile: st.profile,
        areas: st.areas,
        crops: st.crops,
        entries: st.entries,
        photos: st.photos,
        peerVisits: st.peerVisits,
        manualChecks: st.manualChecks,
        lastVisitDate: st.lastVisitDate,
        lastExportAt: st.lastExportAt,
        lastAreaId: st.lastAreaId,
        cropUsage: st.cropUsage,
        fontSize: st.fontSize,
        pendingChanges: st.pendingChanges,
        culturasUpdatedAt: st.culturasUpdatedAt,
        visitaUpdatedAt: st.visitaUpdatedAt,
        sync: st.sync,
        grupo: st.grupo,
        grupoEnviadas: st.grupoEnviadas,
        grupoEnviadasDe: st.grupoEnviadasDe,
        grupoRecusadas: st.grupoRecusadas,
      }),
      onRehydrateStorage: () => () => {
        useApp.setState({ hydrated: true });
      },
    },
  ),
);

/** Anotações ativas (sem as apagadas). */
export function useEntries(): Entry[] {
  return useApp(useShallow((s) => live(s.entries)));
}

/** Áreas ativas (sem as apagadas). */
export function useAreas(): Area[] {
  return useApp(useShallow((s) => live(s.areas)));
}

/** Fotos do caderno ativas (sem as apagadas). */
export function usePhotos(): NotebookPhoto[] {
  return useApp(useShallow((s) => live(s.photos)));
}

/** Visitas do roteiro ativas (sem as apagadas), da mais recente para a mais antiga. */
export function usePeerVisits(): Visita[] {
  return useApp(useShallow((s) => live(s.peerVisits).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
}

/** Monta o conteúdo da cópia de segurança a partir do estado atual. */
export function exportSnapshot(st: AppData, exportedAt: string): BackupData {
  return {
    app: 'caderno-de-bolso',
    version: BACKUP_VERSION,
    exportedAt,
    profile: st.profile,
    areas: st.areas,
    crops: st.crops,
    entries: st.entries,
    photos: st.photos,
    manualChecks: st.manualChecks,
    lastVisitDate: st.lastVisitDate,
    peerVisits: st.peerVisits,
    grupo: st.grupo,
  };
}

/** Data da anotação mais recente. */
export function lastEntryDate(entries: Entry[]): ISODate | undefined {
  let max: ISODate | undefined;
  for (const e of entries) if (!max || e.date > max) max = e.date;
  return max;
}
