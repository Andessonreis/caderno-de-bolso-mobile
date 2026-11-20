import {
  type Ficha,
  base64UrlDecode,
  base64UrlEncode,
  decodeFicha,
  encodeFicha,
  fichaFromProfile,
  fichaUrl,
  utf8Decode,
  utf8Encode,
} from '../ficha';

describe('base64url e UTF-8', () => {
  it('codifica igual ao Buffer do Node (base64url sem padding)', () => {
    const samples = ['', 'a', 'ab', 'abc', 'São João', 'feijão, açúcar e café', 'ç~^´`', '🌽 milho'];
    for (const s of samples) {
      const expected = Buffer.from(s, 'utf8').toString('base64url');
      expect(base64UrlEncode(utf8Encode(s))).toBe(expected);
    }
  });

  it('decodifica de volta', () => {
    const s = 'Irecê, Canarana, Lapão — ação!';
    expect(utf8Decode(base64UrlDecode(base64UrlEncode(utf8Encode(s))))).toBe(s);
  });

  it('nunca usa + / ou =', () => {
    const out = base64UrlEncode(utf8Encode('>>>???~~~ãããõõõ'.repeat(5)));
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe('encodeFicha / decodeFicha', () => {
  const full: Ficha = {
    v: 1,
    n: 'José da Conceição',
    m: 'Irecê-BA',
    c: 'Núcleo São Gonçalo',
    o: 'OPAC Sertão',
    ct: 'Nº 12/2020',
    d: 2020,
    r: 'BA-0001',
    s: 'LOTE-ÁÉÍ',
    cu: ['milho crioulo', 'feijão', 'maçã'],
    u: '2026-11-20',
  };

  it('faz ida e volta com acentos', () => {
    expect(decodeFicha(encodeFicha(full))).toEqual(full);
  });

  it('é compatível com JSON.stringify + Buffer (o que o site espera)', () => {
    const viaNode = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
    expect(encodeFicha(full)).toBe(viaNode);
    const back = JSON.parse(Buffer.from(encodeFicha(full), 'base64url').toString('utf8'));
    expect(back).toEqual(full);
  });

  it('recusa conteúdo inválido', () => {
    expect(decodeFicha('###')).toBeNull();
    expect(decodeFicha(Buffer.from('{"v":2,"n":"x"}').toString('base64url'))).toBeNull();
    expect(decodeFicha(Buffer.from('{"v":1}').toString('base64url'))).toBeNull();
    expect(decodeFicha(Buffer.from('{"v":1,"n":"x","cu":[1]}').toString('base64url'))).toBeNull();
  });
});

describe('fichaFromProfile', () => {
  it('omite campos vazios e limita culturas a 12', () => {
    const crops = Array.from({ length: 15 }, (_, i) => `cultura ${i}`);
    const f = fichaFromProfile({ name: '  Ana  ', municipality: ' ', cooperative: 'Coop' }, crops);
    expect(f).toEqual({ v: 1, n: 'Ana', c: 'Coop', cu: crops.slice(0, 12) });
    expect(Object.keys(f)).not.toContain('m');
    expect(JSON.stringify(f)).not.toContain('undefined');
  });

  it('inclui a data da última anotação e o código de rastreio', () => {
    const f = fichaFromProfile({ name: 'Ana', traceCode: 'ABC', certifiedSince: 2018 }, [], '2026-11-01');
    expect(f).toEqual({ v: 1, n: 'Ana', d: 2018, s: 'ABC', u: '2026-11-01' });
  });
});

describe('fichaUrl', () => {
  it('monta a URL do contrato', () => {
    const f: Ficha = { v: 1, n: 'Ana' };
    expect(fichaUrl(f, 'https://exemplo.app/')).toBe(`https://exemplo.app/ficha#d=${encodeFicha(f)}`);
  });
});
