// Teste da OS-419 (quando a venda abre). Rodar: `bun test src/lib/lot-availability.test.ts`.
// @ts-ignore: o `bun:test` só existe no bun; a checagem de tipos do site não o conhece.
import { describe, expect, test } from 'bun:test';
import { isLotOpenForSale, proximaAbertura, textoDaAbertura, type LotForAvailability } from './lot-availability';

const AGORA = new Date('2026-11-12T11:00:00Z'); // 12/11 08h de Brasília

const lote = (x: Partial<LotForAvailability> & { id: string }): LotForAvailability => ({
  is_active: true,
  sales_start_type: 'now',
  start_date: null,
  end_date: null,
  starts_after_lot_id: null,
  total_quantity: 100,
  sold_quantity: 0,
  reserved_quantity: 0,
  manually_sold_out: false,
  ...x,
});

// O caso do Curral di Luzia: dois lotes agendados para 16/11 06h (09h UTC) e um inativo.
const curral = [
  lote({ id: 'promo', sales_start_type: 'scheduled', start_date: '2026-11-16T09:00:00+00:00' }),
  lote({ id: 'duplo', sales_start_type: 'scheduled', start_date: '2026-11-16T09:00:00+00:00', group_ticket_enabled: true, group_ticket_quantity: 2 }),
  lote({ id: 'segundo', is_active: false, sales_start_type: 'scheduled', start_date: '2026-11-10T09:00:00+00:00' }),
];

describe('proximaAbertura', () => {
  test('Curral: hora mais próxima e os dois lotes dessa hora', () => {
    const p = proximaAbertura(curral, AGORA)!;
    expect(p.quando.toISOString()).toBe('2026-11-16T09:00:00.000Z');
    expect(p.lotes.map((l) => l.id).sort()).toEqual(['duplo', 'promo']);
    expect(curral.some((l) => isLotOpenForSale(l, curral, AGORA))).toBe(false);
  });

  test('pega a hora mais cedo entre lotes agendados diferentes', () => {
    const p = proximaAbertura([
      lote({ id: 'b', sales_start_type: 'scheduled', start_date: '2026-11-20T23:00:00Z' }),
      lote({ id: 'a', sales_start_type: 'scheduled', start_date: '2026-11-14T22:30:00Z' }),
    ], AGORA)!;
    expect(p.lotes.map((l) => l.id)).toEqual(['a']);
  });

  test('evento sem lote: nada', () => {
    expect(proximaAbertura([], AGORA)).toBeNull();
  });

  test('só lote encadeado fechado: nada (não tem hora marcada)', () => {
    const lots = [
      lote({ id: '1', manually_sold_out: false, total_quantity: 10, sold_quantity: 2, end_date: '2026-11-01T00:00:00Z' }),
      lote({ id: '2', sales_start_type: 'after_lot', starts_after_lot_id: 'x' }),
    ];
    expect(proximaAbertura(lots, AGORA)).toBeNull();
  });

  test('agendado no passado (já abriu ou fechou por outro motivo): nada', () => {
    expect(proximaAbertura([lote({ id: 'p', sales_start_type: 'scheduled', start_date: '2026-11-11T09:00:00Z' })], AGORA)).toBeNull();
  });

  test('fora do aviso: inativo, retirada pública, escondido, esgotado, esgotado à mão, fim vencido ou antes da abertura', () => {
    const futuro = { sales_start_type: 'scheduled', start_date: '2026-11-16T09:00:00Z' };
    const fora = [
      lote({ id: 'inativo', ...futuro, is_active: false }),
      lote({ id: 'retirada', ...futuro, retirada_publica: true }),
      { ...lote({ id: 'escondido', ...futuro }), escondido: true } as LotForAvailability,
      lote({ id: 'esgotado', ...futuro, sold_quantity: 100 }),
      lote({ id: 'a-mao', ...futuro, manually_sold_out: true }),
      lote({ id: 'fim-vencido', ...futuro, end_date: '2026-11-11T00:00:00Z' }),
      lote({ id: 'fim-antes', ...futuro, end_date: '2026-11-15T00:00:00Z' }),
    ];
    for (const l of fora) expect(proximaAbertura([l], AGORA)).toBeNull();
  });
});

describe('textoDaAbertura (hora de Brasília)', () => {
  test('hora cheia sem minutos', () => {
    expect(textoDaAbertura(new Date('2026-11-16T09:00:00Z'))).toBe('16/11 às 06h');
  });
  test('com minutos', () => {
    expect(textoDaAbertura(new Date('2026-11-16T09:30:00Z'))).toBe('16/11 às 06h30');
  });
  test('meia-noite e virada de dia em UTC', () => {
    expect(textoDaAbertura(new Date('2026-12-01T03:00:00Z'))).toBe('01/12 às 00h');
    expect(textoDaAbertura(new Date('2026-12-01T02:15:00Z'))).toBe('30/11 às 23h15');
  });
});
