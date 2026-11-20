import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BackupData } from '@/lib/backup';
import { migratePersisted, STORAGE_VERSION } from '@/lib/migrate';
import { buildSampleData, removeSampleData } from '@/lib/sample';
import type { Area, Entry, FontSizeChoice, ISODate, ManualCheckId, NotebookPhoto, Profile } from '@/lib/types';
import { bumpUsage } from '@/lib/usage';

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AppData {
  profile: Profile | null;
  areas: Area[];
  crops: string[];
  entries: Entry[];
  photos: NotebookPhoto[];
  manualChecks: Partial<Record<ManualCheckId, boolean>>;
  lastVisitDate?: ISODate;
  lastExportAt?: ISODate;
  lastAreaId?: string;
  cropUsage: Record<string, number>;
  fontSize: FontSizeChoice;
}

interface AppActions {
  completeOnboarding: (profile: Profile, areas: Area[], crops: string[]) => void;
  loadSample: (today: ISODate) => void;
  /** Apaga o que veio dos dados de exemplo. Quem chama apaga os arquivos de foto devolvidos. */
  removeSample: () => { wasSampleProfile: boolean; removedPhotos: string[] };
  updateProfile: (profile: Profile) => void;
  addArea: (name: string) => void;
  renameArea: (id: string, name: string) => void;
  removeArea: (id: string) => void;
  setCrops: (crops: string[]) => void;
  addEntry: (entry: Entry) => void;
  updateEntry: (entry: Entry) => void;
  deleteEntry: (id: string) => Entry | undefined;
  /** Devolve uma anotação apagada (botão "Desfazer"). */
  restoreEntry: (entry: Entry) => void;
  setCopied: (ids: string[], copied: boolean) => void;
  addPhoto: (photo: NotebookPhoto) => void;
  updatePhoto: (id: string, caption: string) => void;
  removePhoto: (id: string) => void;
  setManualCheck: (id: ManualCheckId, value: boolean) => void;
  setLastVisitDate: (date: ISODate | undefined) => void;
  /** Desmarca os itens que o produtor marca à mão (nova visita). */
  resetManualChecks: () => void;
  setFontSize: (size: FontSizeChoice) => void;
  markExported: (date: ISODate) => void;
  importData: (data: BackupData) => void;
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
};

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData,
      hydrated: false,

      completeOnboarding: (profile, areas, crops) =>
        // Junta com o que já existir (ex.: áreas criadas enquanto o exemplo estava carregado).
        set((st) => ({
          profile,
          areas: [...st.areas, ...areas],
          crops: [...new Set([...st.crops, ...crops])],
        })),

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
        const { state, removedPhotos, wasSampleProfile } = removeSampleData(get());
        set(state);
        return { wasSampleProfile, removedPhotos };
      },

      updateProfile: (profile) => set({ profile }),

      addArea: (name) => set((st) => ({ areas: [...st.areas, { id: newId(), name: name.trim() }] })),

      renameArea: (id, name) =>
        set((st) => ({ areas: st.areas.map((a) => (a.id === id ? { ...a, name: name.trim() } : a)) })),

      removeArea: (id) =>
        set((st) => ({
          areas: st.areas.filter((a) => a.id !== id),
          lastAreaId: st.lastAreaId === id ? undefined : st.lastAreaId,
        })),

      setCrops: (crops) => set({ crops }),

      addEntry: (entry) =>
        set((st) => ({
          entries: [...st.entries, entry],
          lastAreaId: entry.areaId,
          cropUsage: bumpUsage(st.cropUsage, entry.crop),
        })),

      updateEntry: (entry) => set((st) => ({ entries: st.entries.map((e) => (e.id === entry.id ? entry : e)) })),

      deleteEntry: (id) => {
        const found = get().entries.find((e) => e.id === id);
        set((st) => ({ entries: st.entries.filter((e) => e.id !== id) }));
        return found;
      },

      restoreEntry: (entry) =>
        set((st) => (st.entries.some((e) => e.id === entry.id) ? st : { entries: [...st.entries, entry] })),

      setCopied: (ids, copied) => {
        const wanted = new Set(ids);
        set((st) => ({ entries: st.entries.map((e) => (wanted.has(e.id) ? { ...e, copied } : e)) }));
      },

      addPhoto: (photo) => set((st) => ({ photos: [photo, ...st.photos] })),

      updatePhoto: (id, caption) =>
        set((st) => ({
          photos: st.photos.map((p) => (p.id === id ? { ...p, caption: caption.trim() || undefined } : p)),
        })),

      removePhoto: (id) => set((st) => ({ photos: st.photos.filter((p) => p.id !== id) })),

      setManualCheck: (id, value) => set((st) => ({ manualChecks: { ...st.manualChecks, [id]: value } })),

      setLastVisitDate: (date) => set({ lastVisitDate: date }),

      resetManualChecks: () => set({ manualChecks: {} }),

      setFontSize: (fontSize) => set({ fontSize }),

      markExported: (date) => set({ lastExportAt: date }),

      importData: (data) =>
        set({
          profile: data.profile,
          areas: data.areas,
          crops: data.crops,
          entries: data.entries,
          manualChecks: data.manualChecks,
          lastVisitDate: data.lastVisitDate,
          lastAreaId: undefined,
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
        manualChecks: st.manualChecks,
        lastVisitDate: st.lastVisitDate,
        lastExportAt: st.lastExportAt,
        lastAreaId: st.lastAreaId,
        cropUsage: st.cropUsage,
        fontSize: st.fontSize,
      }),
      onRehydrateStorage: () => () => {
        useApp.setState({ hydrated: true });
      },
    },
  ),
);

/** Monta o arquivo de exportação a partir do estado atual. */
export function exportSnapshot(st: AppData, exportedAt: string): BackupData {
  return {
    app: 'caderno-de-bolso',
    version: 1,
    exportedAt,
    profile: st.profile,
    areas: st.areas,
    crops: st.crops,
    entries: st.entries,
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
