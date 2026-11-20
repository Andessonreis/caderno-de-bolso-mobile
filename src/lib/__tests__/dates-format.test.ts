import {
  addDays,
  daysBetween,
  formatRange,
  formatRelativeDay,
  monthRange,
  parseISODate,
  shiftRange,
  weekRange,
} from '../dates';
import { applyKey, formatMoney, formatNumber, numberToInput, parseDecimal } from '../format';

describe('datas', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta dias entre datas', () => {
    expect(daysBetween('2026-11-01', '2026-11-20')).toBe(19);
    expect(daysBetween('2026-11-20', '2026-11-01')).toBe(-19);
  });

  it('recusa datas inválidas', () => {
    expect(parseISODate('2026-02-30')).toBeNull();
    expect(parseISODate('20/11/2026')).toBeNull();
  });

  it('semana vai de segunda a domingo', () => {
    // 20/11/2026 é sexta-feira
    expect(weekRange('2026-11-20')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    // domingo pertence à semana que começou na segunda anterior
    expect(weekRange('2026-11-22')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
  });

  it('mês inteiro e navegação', () => {
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(shiftRange('mes', monthRange('2026-01-15'), -1)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(shiftRange('semana', weekRange('2026-11-20'), 1)).toEqual({ start: '2026-11-23', end: '2026-11-29' });
  });

  it('rótulos em português', () => {
    expect(formatRelativeDay('2026-11-20', '2026-11-20')).toBe('Hoje');
    expect(formatRelativeDay('2026-11-19', '2026-11-20')).toBe('Ontem');
    expect(formatRelativeDay('2026-11-16', '2026-11-20')).toBe('segunda, 16 de novembro');
    expect(formatRange('semana', { start: '2026-11-30', end: '2026-12-06' })).toBe('30 de novembro a 6 de dezembro');
    expect(formatRange('mes', monthRange('2026-11-03'))).toBe('novembro de 2026');
  });
});

describe('números', () => {
  it('formata no jeito brasileiro', () => {
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(12.5)).toBe('12,5');
    expect(formatNumber(1200.25)).toBe('1.200,25');
    expect(formatMoney(1234.5)).toBe('R$ 1.234,50');
  });

  it('lê o que foi digitado', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('3')).toBe(3);
    expect(parseDecimal('0')).toBeUndefined();
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('1,2,3')).toBeUndefined();
  });

  it('teclado numérico', () => {
    let t = '';
    for (const k of ['1', '2', ',', '5', '0', '9']) t = applyKey(t, k);
    expect(t).toBe('12,50');
    expect(applyKey('12', ',')).toBe('12,');
    expect(applyKey('12,', ',')).toBe('12,');
    expect(applyKey('', ',')).toBe('0,');
    expect(applyKey('0', '7')).toBe('7');
    expect(applyKey('12', 'apagar')).toBe('1');
    expect(numberToInput(12.5)).toBe('12,5');
  });
});
