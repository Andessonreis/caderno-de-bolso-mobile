import { addDays } from './dates';
import type { Area, Entry, ISODate, Profile } from './types';

/**
 * Produtor fictício para demonstração. Nenhum dado aqui é de pessoa ou
 * organização real.
 */
export interface SampleData {
  profile: Profile;
  areas: Area[];
  crops: string[];
  entries: Entry[];
}

type SampleEntry = Omit<Entry, 'id' | 'date' | 'createdAt' | 'copied' | 'exemplo'>;

export function buildSampleData(today: ISODate): SampleData {
  const areas: Area[] = [
    { id: 'ex-canteiro-1', name: 'Canteiro 1', exemplo: true },
    { id: 'ex-canteiro-2', name: 'Canteiro 2', exemplo: true },
    { id: 'ex-roca-baixo', name: 'Roça de baixo', exemplo: true },
  ];
  const [c1, c2, roca] = areas.map((a) => a.id);

  // [dias atrás, já passada a limpo?, anotação]
  const raw: [number, boolean, SampleEntry][] = [
    [20, true, { areaId: roca, crop: 'milho crioulo', activity: 'plantio', quantity: 5, unit: 'kg', variety: 'Palha roxa', seedOrigin: 'banco' }],
    [20, true, { areaId: roca, crop: 'feijão', activity: 'plantio', quantity: 3, unit: 'kg', seedOrigin: 'troca' }],
    [19, true, { areaId: c1, crop: 'alface', activity: 'adubacao', quantity: 2, unit: 'carrinho', input: 'composto', inputOrigin: 'proprio' }],
    [18, true, { areaId: c1, crop: 'alface', activity: 'colheita', quantity: 40, unit: 'unidade' }],
    [18, true, { areaId: c1, crop: 'alface', activity: 'venda', quantity: 35, unit: 'unidade', value: 70, destination: 'feira' }],
    [17, true, { areaId: c2, crop: 'coentro', activity: 'colheita', quantity: 30, unit: 'maco' }],
    [17, true, { areaId: c2, crop: 'coentro', activity: 'venda', quantity: 30, unit: 'maco', value: 45, destination: 'feira' }],
    [16, false, { areaId: c2, crop: 'tomate', activity: 'adubacao', quantity: 5, unit: 'litro', input: 'calda-bordalesa', inputOrigin: 'proprio' }],
    [15, false, { areaId: roca, crop: 'milho crioulo', activity: 'manejo', note: 'Capina entre as linhas' }],
    [13, true, { areaId: c1, crop: 'couve', activity: 'compra', quantity: 1, unit: 'unidade', purchaseKind: 'semente', value: 12 }],
    [12, true, { areaId: c1, crop: 'couve', activity: 'plantio', quantity: 60, unit: 'unidade', seedOrigin: 'comprada' }],
    [11, true, { areaId: c2, crop: 'tomate', activity: 'colheita', quantity: 3, unit: 'caixa' }],
    [11, true, { areaId: c2, crop: 'tomate', activity: 'venda', quantity: 2, unit: 'caixa', value: 120, destination: 'cooperativa' }],
    [10, true, { areaId: c1, crop: 'alface', activity: 'rega' }],
    [8, false, { areaId: roca, crop: 'feijão', activity: 'adubacao', quantity: 4, unit: 'carrinho', input: 'esterco', inputOrigin: 'proprio' }],
    [7, false, { areaId: c2, crop: 'coentro', activity: 'plantio', quantity: 0.5, unit: 'kg' }],
    [6, false, { areaId: c1, crop: 'alface', activity: 'colheita', quantity: 50, unit: 'unidade' }],
    [6, false, { areaId: c1, crop: 'alface', activity: 'venda', quantity: 45, unit: 'unidade', value: 90, destination: 'institucional' }],
    [4, false, { areaId: c2, crop: 'tomate', activity: 'colheita', quantity: 4, unit: 'caixa' }],
    [4, false, { areaId: c2, crop: 'tomate', activity: 'venda', quantity: 60, unit: 'kg', value: 240, destination: 'direta' }],
    [3, false, { areaId: c1, crop: 'couve', activity: 'adubacao', quantity: 10, unit: 'litro', input: 'biofertilizante', inputOrigin: 'proprio' }],
    [2, false, { areaId: c2, crop: 'coentro', activity: 'rega' }],
    [1, false, { areaId: c2, crop: 'coentro', activity: 'colheita', quantity: 25, unit: 'maco' }],
    [1, false, { areaId: c2, crop: 'coentro', activity: 'venda', quantity: 20, unit: 'maco', destination: 'feira' }],
    [0, false, { areaId: roca, crop: 'feijão', activity: 'manejo', note: 'Tirou mato do pé' }],
  ];

  const entries: Entry[] = raw.map(([ago, copied, e], i) => {
    const date = addDays(today, -ago);
    return {
      ...e,
      id: `ex-${i + 1}`,
      date,
      copied,
      createdAt: `${date}T0${7 + (i % 3)}:00:00.000Z`,
      exemplo: true,
    };
  });

  return {
    profile: {
      name: 'Zé Carlos',
      municipality: 'Canarana-BA',
      cooperative: 'Núcleo Pé de Serra (exemplo)',
      opac: 'Certificadora de exemplo',
      certificateId: 'EXEMPLO-123',
      certifiedSince: 2019,
      nationalRegistry: 'EXEMPLO-0001',
      exemplo: true,
    },
    areas,
    crops: ['milho crioulo', 'feijão', 'alface', 'coentro', 'couve', 'tomate'],
    entries,
  };
}
