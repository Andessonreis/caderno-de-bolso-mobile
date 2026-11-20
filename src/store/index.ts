import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import {
  type Change,
  type EntityKind,
  enqueue,
  findLive,
  live,
  patchMany,
  softDelete,
  undelete,
  upsert,
} from '@/data/repository';
import { BACKUP_VERSION, type BackupData } from '@/lib/backup';
import { uuid } from '@/lib/ids';
import { initialChanges, migratePersisted, STORAGE_VERSION } from '@/lib/migrate';
import { buildSampleData, removeSampleData } from '@/lib/sample';
import type { Area, Entry, FontSizeChoice, ISODate, ManualCheckId, NotebookPhoto, Profile } from '@/lib/types';
import { bumpUsage } from '@/lib/usage';

/** Novo id estável (UUID v4). */
export function newId(): string {
  return uuid();
}

function nowISO(): string {
  return new Date().toISOString();
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
  manualChecks: Partial<Record<ManualCheckId, boolean>>;
  lastVisitDate?: ISODate;
  lastExportAt?: ISODate;
  lastAreaId?: string;
  cropUsage: Record<string, number>;
  fontSize: FontSizeChoice;
  /** Alterações ainda não enviadas para uma sincronização online. */
  pendingChanges: Change[];
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
  setManualCheck: (id: ManualCheckId, value: boolean) => void;
  setLastVisitDate: (date: ISODate | undefined) => void;
  /** Desmarca os itens que o produtor marca à mão (nova visita). */
  resetManualChecks: () => void;
  setFontSize: (size: FontSizeChoice) => void;
  markExported: (date: ISODate) => void;
  /** Troca os dados pelos do arquivo. `keepPhotos`: mantém as fotos do caderno atuais (arquivo antigo, sem fotos). */
  importData: (data: BackupData, keepPhotos?: boolean) => void;
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
  manualChecks: {},
  cropUsage: {},
  fontSize: 'normal',
  pendingChanges: [],
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

const SETTINGS = { id: 'settings' };
const PROFILE = { id: 'profile' };

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData,
      hydrated: false,

      completeOnboarding: (profile, areas, crops) =>
        // Junta com o que já existir (ex.: áreas criadas enquanto o exemplo estava carregado).
        set((st) => {
          const now = nowISO();
          let queue = track(st.pendingChanges, 'profile', PROFILE);
          queue = track(queue, 'settings', SETTINGS);
          let list = st.areas;
          for (const a of areas) {
            list = upsert(list, a, now);
            queue = track(queue, 'area', a);
          }
          return {
            profile: { ...profile, updatedAt: now },
            areas: list,
            crops: [...new Set([...st.crops, ...crops])],
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
          return { profile: next, pendingChanges: track(st.pendingChanges, 'profile', { ...PROFILE, exemplo: next.exemplo }) };
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
        set((st) => ({ crops, pendingChanges: track(st.pendingChanges, 'settings', SETTINGS) })),

      addEntry: (entry) =>
        set((st) => ({
          entries: upsert(st.entries, entry, nowISO()),
          lastAreaId: entry.areaId,
          cropUsage: bumpUsage(st.cropUsage, entry.crop),
          pendingChanges: track(st.pendingChanges, 'entry', entry),
        })),

      updateEntry: (entry) =>
        set((st) => ({
          entries: upsert(st.entries, entry, nowISO()),
          pendingChanges: track(st.pendingChanges, 'entry', entry),
        })),

      deleteEntry: (id) => {
        const found = findLive(get().entries, id);
        if (!found) return undefined;
        set((st) => ({
          entries: softDelete(st.entries, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'entry', found, 'delete'),
        }));
        return found;
      },

      restoreEntry: (id) =>
        set((st) => ({
          entries: undelete(st.entries, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'entry', st.entries.find((e) => e.id === id) ?? null),
        })),

      setCopied: (ids, copied) =>
        set((st) => {
          const wanted = new Set(ids);
          let queue = st.pendingChanges;
          for (const e of st.entries) if (wanted.has(e.id)) queue = track(queue, 'entry', e);
          return { entries: patchMany(st.entries, wanted, { copied }, nowISO()), pendingChanges: queue };
        }),

      addPhoto: (photo) =>
        set((st) => {
          const now = nowISO();
          return {
            photos: [{ ...photo, updatedAt: now }, ...st.photos],
            pendingChanges: track(st.pendingChanges, 'photo', photo),
          };
        }),

      updatePhoto: (id, caption) =>
        set((st) => {
          const photo = findLive(st.photos, id);
          if (!photo) return st;
          return {
            photos: upsert(st.photos, { ...photo, caption: caption.trim() || undefined }, nowISO()),
            pendingChanges: track(st.pendingChanges, 'photo', photo),
          };
        }),

      removePhoto: (id) =>
        set((st) => ({
          photos: softDelete(st.photos, id, nowISO()),
          pendingChanges: track(st.pendingChanges, 'photo', { id }, 'delete'),
        })),

      setManualCheck: (id, value) =>
        set((st) => ({
          manualChecks: { ...st.manualChecks, [id]: value },
          pendingChanges: track(st.pendingChanges, 'settings', SETTINGS),
        })),

      setLastVisitDate: (date) =>
        set((st) => ({ lastVisitDate: date, pendingChanges: track(st.pendingChanges, 'settings', SETTINGS) })),

      resetManualChecks: () =>
        set((st) => ({ manualChecks: {}, pendingChanges: track(st.pendingChanges, 'settings', SETTINGS) })),

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
          manualChecks: data.manualChecks,
          lastVisitDate: data.lastVisitDate,
        };
        set({ ...imported, lastAreaId: undefined, pendingChanges: initialChanges(imported, deps) });
      },

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
        manualChecks: st.manualChecks,
        lastVisitDate: st.lastVisitDate,
        lastExportAt: st.lastExportAt,
        lastAreaId: st.lastAreaId,
        cropUsage: st.cropUsage,
        fontSize: st.fontSize,
        pendingChanges: st.pendingChanges,
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
  };
}

/** Data da anotação mais recente. */
export function lastEntryDate(entries: Entry[]): ISODate | undefined {
  let max: ISODate | undefined;
  for (const e of entries) if (!max || e.date > max) max = e.date;
  return max;
}
