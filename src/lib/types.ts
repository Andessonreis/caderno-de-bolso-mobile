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

export interface Area {
  id: string;
  name: string;
  exemplo?: boolean;
}

export interface Entry {
  id: string;
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
}

/** Foto de uma página do caderno de papel (cópia de segurança). */
export interface NotebookPhoto {
  id: string;
  /** Caminho relativo à pasta de fotos (ex.: "caderno/1732.jpg"). */
  file: string;
  date: ISODate;
  caption?: string;
}

export type ManualCheckId = 'notas' | 'dtcs' | 'plano' | 'separacao' | 'pendencias';

export type FontSizeChoice = 'normal' | 'grande' | 'muito-grande';
