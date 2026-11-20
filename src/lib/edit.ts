import type { Entry } from './types';

/** Campos que aparecem no caderno de papel. Mudar algum deles pede passar a limpo de novo. */
const NOTEBOOK_FIELDS: (keyof Entry)[] = [
  'date',
  'areaId',
  'crop',
  'activity',
  'quantity',
  'unit',
  'variety',
  'seedOrigin',
  'input',
  'inputOrigin',
  'purchaseKind',
  'value',
  'destination',
  'note',
];

/** A edição mudou algo que já tinha sido passado para o caderno? */
export function notebookFieldsChanged(before: Entry, after: Entry): boolean {
  return NOTEBOOK_FIELDS.some((k) => (before[k] ?? undefined) !== (after[k] ?? undefined));
}

/**
 * Prepara a anotação editada: se ela já estava passada a limpo e algo do
 * caderno mudou, volta a ficar pendente.
 */
export function applyEdit(before: Entry, after: Entry): { entry: Entry; reopened: boolean } {
  const reopened = before.copied && notebookFieldsChanged(before, after);
  return { entry: { ...after, copied: reopened ? false : before.copied }, reopened };
}
