import type { FontSizeChoice } from '@/lib/types';

/**
 * Tokens visuais do Caderno de Bolso.
 *
 * Paleta de papel de caderno e terra: fundo claro, quase creme, texto marrom
 * bem escuro e verde-folha para ações. Pensada para ler no sol, com contraste
 * acima de 7:1 no texto principal e acima de 4.5:1 nos textos de apoio.
 */
export const colors = {
  /** Fundo das telas: papel */
  paper: '#F5EFE3',
  /** Cartões e campos */
  surface: '#FFFCF5',
  /** Superfície pressionada / selecionada suave */
  surfaceSunk: '#EBE2D0',
  ink: '#1F1A14',
  inkMuted: '#5A4F43',
  line: '#CBBFA8',
  lineStrong: '#8C7B63',

  /** Verde-folha: ação principal */
  leaf: '#2F5D34',
  leafPressed: '#244A29',
  leafSoft: '#DCE8D3',
  onLeaf: '#FFFFFF',

  /** Terra/barro: destaque secundário */
  clay: '#9A4A1E',
  claySoft: '#F3DFCF',

  /** Atenção (pendente) */
  warn: '#7A4B00',
  warnSoft: '#F8E7C2',

  danger: '#9B2C1F',
  dangerSoft: '#F6D9D3',

  white: '#FFFFFF',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/** Tamanho mínimo de qualquer alvo de toque. */
export const TOUCH_MIN = 56;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'small';

interface TypeSpec {
  size: number;
  lineHeight: number;
  weight: '400' | '600' | '700' | '800';
}

/** Escala base (tamanho "normal"). A fonte base é 18. */
export const typeScale: Record<TextVariant, TypeSpec> = {
  display: { size: 32, lineHeight: 38, weight: '800' },
  title: { size: 26, lineHeight: 32, weight: '800' },
  heading: { size: 21, lineHeight: 27, weight: '700' },
  body: { size: 18, lineHeight: 26, weight: '400' },
  bodyStrong: { size: 18, lineHeight: 26, weight: '700' },
  label: { size: 17, lineHeight: 22, weight: '600' },
  small: { size: 15, lineHeight: 21, weight: '400' },
};

export const FONT_MULTIPLIER: Record<FontSizeChoice, number> = {
  normal: 1,
  grande: 1.15,
  'muito-grande': 1.3,
};

export const FONT_CHOICES: { value: FontSizeChoice; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'grande', label: 'Grande' },
  { value: 'muito-grande', label: 'Muito grande' },
];

/**
 * Limite para o tamanho de letra do sistema, somado ao do app, não quebrar as
 * telas. O texto ainda cresce bastante (até 1,6x o tamanho do app).
 */
export const MAX_SYSTEM_FONT_MULTIPLIER = 1.6;
