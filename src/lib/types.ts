// Tipos de domínio do Caderno de Bolso. Os dados ficam só no aparelho.

/** Data no formato AAAA-MM-DD, sempre no fuso local do aparelho. */
export type ISODate = string;

export type ActivityKind =
  | 'plantio'
  | 'adubacao'
  | 'rega'
  | 'manejo'
  | 'colheita'
  | 'venda'
  | 'compra'
  | 'outra';

export type Unit = 'kg' | 'saca' | 'caixa' | 'maco' | 'unidade' | 'litro' | 'carrinho';

export type SeedOrigin = 'propria' | 'troca' | 'banco' | 'comprada';

export type InputKind =
  | 'esterco'
  | 'composto'
  | 'biofertilizante'
  | 'calda-bordalesa'
  | 'calda-sulfocalcica'
  | 'outro';

export type InputOrigin = 'proprio' | 'comprado';

export type SaleDestination = 'feira' | 'cooperativa' | 'direta' | 'institucional' | 'outro';

/** O que foi comprado numa anotação de "Compra de semente/insumo". */
export type PurchaseKind = 'semente' | 'insumo';

/**
 * Campos de controle de todo registro sincronizável: id estável (UUID), data da
 * última alteração e, quando apagado, a data em que foi apagado (o registro
 * continua guardado para que a exclusão possa ser enviada a outros aparelhos).
 */
export interface SyncMeta {
  id: string;
  /** ISO 8601 */
  updatedAt: string;
  /** ISO 8601. Presente = registro apagado. */
  deletedAt?: string;
}

export interface Area extends SyncMeta {
  name: string;
  exemplo?: boolean;
}

export interface Entry extends SyncMeta {
  date: ISODate;
  areaId: string;
  crop: string;
  activity: ActivityKind;
  quantity?: number;
  unit?: Unit;
  /** Plantio */
  variety?: string;
  seedOrigin?: SeedOrigin;
  /** Adubação/Calda */
  input?: InputKind;
  inputOrigin?: InputOrigin;
  /** Compra */
  purchaseKind?: PurchaseKind;
  /** Venda e compra, em reais */
  value?: number;
  destination?: SaleDestination;
  note?: string;
  /** Foto da anotação: caminho relativo à pasta de fotos (ex.: "anotacoes/1732.jpg"). */
  photo?: string;
  /** Recado de voz: caminho relativo (ex.: "audios/1732.m4a"). */
  audio?: string;
  /** Duração do recado, em segundos. */
  audioSeconds?: number;
  /** Já foi passada a limpo para o caderno de papel. */
  copied: boolean;
  createdAt: string;
  exemplo?: boolean;
}

export interface Profile {
  name: string;
  municipality?: string;
  cooperative?: string;
  opac?: string;
  certificateId?: string;
  certifiedSince?: number;
  nationalRegistry?: string;
  traceCode?: string;
  exemplo?: boolean;
  /** ISO 8601 da última alteração do perfil. */
  updatedAt?: string;
}

/** Foto de uma página do caderno de papel (cópia de segurança). */
export interface NotebookPhoto extends SyncMeta {
  /** Caminho relativo à pasta de fotos (ex.: "caderno/1732.jpg"). */
  file: string;
  date: ISODate;
  caption?: string;
}

export type ManualCheckId = 'notas' | 'dtcs' | 'plano' | 'separacao' | 'pendencias';

export type FontSizeChoice = 'normal' | 'grande' | 'muito-grande';
