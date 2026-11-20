/** Formata número no jeito brasileiro: 12,5 / 1.200. */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [int, dec] = Math.abs(rounded).toFixed(2).split('.');
  const intWithDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decTrimmed = dec.replace(/0+$/, '');
  const sign = rounded < 0 ? '-' : '';
  return decTrimmed ? `${sign}${intWithDots},${decTrimmed}` : `${sign}${intWithDots}`;
}

/** R$ 1.234,50 */
export function formatMoney(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const intWithDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${intWithDots},${dec}`;
}

/**
 * Lê o que o produtor digitou ("12", "12,5", "12.5"). Retorna undefined se não
 * for um número positivo.
 */
export function parseDecimal(text: string): number | undefined {
  const clean = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Aplica um toque do teclado numérico ao texto atual. */
export function applyKey(current: string, key: string): string {
  if (key === 'apagar') return current.slice(0, -1);
  if (key === ',') {
    if (current.includes(',')) return current;
    return current === '' ? '0,' : `${current},`;
  }
  if (!/^\d$/.test(key)) return current;
  const [, dec] = current.split(',');
  if (dec !== undefined && dec.length >= 2) return current;
  if (current.replace(',', '').length >= 7) return current;
  if (current === '0') return key;
  return current + key;
}

/** Converte número para o texto do teclado ("12,5"). */
export function numberToInput(n: number | undefined): string {
  if (n === undefined) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}
