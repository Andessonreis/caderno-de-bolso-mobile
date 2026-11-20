import type {
  ActivityKind,
  InputKind,
  InputOrigin,
  ManualCheckId,
  PurchaseKind,
  SaleDestination,
  SeedOrigin,
  Unit,
} from './types';

/** Nomes de ícones do MaterialCommunityIcons usados no app. */
export type IconName =
  | 'sprout'
  | 'shovel'
  | 'watering-can'
  | 'leaf'
  | 'basket'
  | 'cash'
  | 'cart'
  | 'dots-horizontal-circle-outline'
  | 'seed'
  | 'barn';

export interface ActivityInfo {
  kind: ActivityKind;
  label: string;
  /** Usado no meio da frase: "colheita de 12 kg de feijão". */
  noun: string;
  icon: IconName;
  units: Unit[];
}

export const ACTIVITIES: ActivityInfo[] = [
  { kind: 'plantio', label: 'Plantio', noun: 'plantio', icon: 'sprout', units: ['kg', 'unidade', 'saca'] },
  {
    kind: 'adubacao',
    label: 'Adubação ou calda',
    noun: 'adubação',
    icon: 'shovel',
    units: ['kg', 'litro', 'carrinho', 'saca'],
  },
  { kind: 'rega', label: 'Rega', noun: 'rega', icon: 'watering-can', units: [] },
  { kind: 'manejo', label: 'Capina ou manejo', noun: 'capina/manejo', icon: 'leaf', units: [] },
  {
    kind: 'colheita',
    label: 'Colheita',
    noun: 'colheita',
    icon: 'basket',
    units: ['kg', 'saca', 'caixa', 'maco', 'unidade'],
  },
  {
    kind: 'venda',
    label: 'Venda',
    noun: 'venda',
    icon: 'cash',
    units: ['kg', 'saca', 'caixa', 'maco', 'unidade'],
  },
  {
    kind: 'compra',
    label: 'Compra de semente ou insumo',
    noun: 'compra',
    icon: 'cart',
    units: ['kg', 'saca', 'litro', 'unidade'],
  },
  { kind: 'outra', label: 'Outra coisa', noun: 'anotação', icon: 'dots-horizontal-circle-outline', units: [] },
];

export function activityInfo(kind: ActivityKind): ActivityInfo {
  const found = ACTIVITIES.find((a) => a.kind === kind);
  if (!found) throw new Error(`Atividade desconhecida: ${kind}`);
  return found;
}

/** Atividades em que a quantidade faz parte da anotação. */
export function activityHasQuantity(kind: ActivityKind): boolean {
  return activityInfo(kind).units.length > 0;
}

const UNIT_LABELS: Record<Unit, { one: string; many: string; short: string }> = {
  kg: { one: 'quilo', many: 'quilos', short: 'kg' },
  saca: { one: 'saca', many: 'sacas', short: 'saca' },
  caixa: { one: 'caixa', many: 'caixas', short: 'caixa' },
  maco: { one: 'maço', many: 'maços', short: 'maço' },
  unidade: { one: 'unidade', many: 'unidades', short: 'un.' },
  litro: { one: 'litro', many: 'litros', short: 'L' },
  carrinho: { one: 'carrinho de mão', many: 'carrinhos de mão', short: 'carrinho' },
};

export const ALL_UNITS = Object.keys(UNIT_LABELS) as Unit[];

/** Nome da unidade para botões ("Quilo (kg)"). */
export function unitButtonLabel(u: Unit): string {
  const l = UNIT_LABELS[u];
  const name = l.one.charAt(0).toUpperCase() + l.one.slice(1);
  return u === 'kg' ? `${name} (kg)` : name;
}

/** Unidade concordando com a quantidade: "1 saca", "3 sacas", "12 kg". */
export function unitText(u: Unit, quantity: number): string {
  if (u === 'kg') return 'kg';
  if (u === 'litro') return quantity === 1 ? 'litro' : 'litros';
  return quantity === 1 ? UNIT_LABELS[u].one : UNIT_LABELS[u].many;
}

export function isUnit(v: unknown): v is Unit {
  return typeof v === 'string' && v in UNIT_LABELS;
}

export const SEED_ORIGINS: { value: SeedOrigin; label: string }[] = [
  { value: 'propria', label: 'Semente própria' },
  { value: 'troca', label: 'Troca com vizinho' },
  { value: 'banco', label: 'Banco de sementes' },
  { value: 'comprada', label: 'Comprada com nota' },
];

export const INPUTS: { value: InputKind; label: string }[] = [
  { value: 'esterco', label: 'Esterco' },
  { value: 'composto', label: 'Composto' },
  { value: 'biofertilizante', label: 'Biofertilizante' },
  { value: 'calda-bordalesa', label: 'Calda bordalesa' },
  { value: 'calda-sulfocalcica', label: 'Calda sulfocálcica' },
  { value: 'outro', label: 'Outro' },
];

export const INPUT_ORIGINS: { value: InputOrigin; label: string }[] = [
  { value: 'proprio', label: 'Feito aqui / próprio' },
  { value: 'comprado', label: 'Comprado' },
];

export const DESTINATIONS: { value: SaleDestination; label: string }[] = [
  { value: 'feira', label: 'Feira' },
  { value: 'cooperativa', label: 'Cooperativa' },
  { value: 'direta', label: 'Venda direta' },
  { value: 'institucional', label: 'Compra pública (escola, governo)' },
  { value: 'outro', label: 'Outro' },
];

export const PURCHASE_KINDS: { value: PurchaseKind; label: string }[] = [
  { value: 'semente', label: 'Semente ou muda' },
  { value: 'insumo', label: 'Adubo, calda ou outro insumo' },
];

export function labelOf<T extends string>(list: { value: T; label: string }[], value: T | undefined): string {
  if (value === undefined) return '';
  return list.find((i) => i.value === value)?.label ?? '';
}

/** Lista pronta de culturas comuns no Território de Irecê. */
export const COMMON_CROPS = [
  'milho crioulo',
  'feijão',
  'feijão de corda',
  'mamona',
  'mandioca',
  'abóbora',
  'alface',
  'coentro',
  'cebolinha',
  'couve',
  'cenoura',
  'beterraba',
  'tomate',
  'cebola',
  'pimentão',
  'quiabo',
  'maxixe',
  'banana',
  'mamão',
  'maracujá',
];

/** Culturas que pedem comprovação de origem da semente (não transgênica). */
export const SEED_PROOF_CROPS = ['milho', 'feijão'];

export function needsSeedProof(crop: string): boolean {
  const c = crop.toLowerCase();
  return SEED_PROOF_CROPS.some((p) => c.startsWith(p));
}

export const MANUAL_CHECKS: { id: ManualCheckId; label: string; help: string }[] = [
  {
    id: 'notas',
    label: 'Notas fiscais e recibos guardados',
    help: 'Das sementes, insumos e vendas. Guarde numa pasta junto com o caderno.',
  },
  {
    id: 'dtcs',
    label: 'Declarações de transação (DTC) guardadas',
    help: 'As vias das declarações que você entregou aos compradores.',
  },
  {
    id: 'plano',
    label: 'Plano de manejo atualizado',
    help: 'Se mudou alguma área, cultura ou prática, atualize o plano antes da visita.',
  },
  {
    id: 'separacao',
    label: 'Armazenamento e transporte separados',
    help: 'Produto orgânico guardado e levado sem misturar com produto convencional.',
  },
  {
    id: 'pendencias',
    label: 'Pendências da última visita resolvidas',
    help: 'Confira o que ficou combinado na visita anterior.',
  },
];

/** Primeira letra maiúscula. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
