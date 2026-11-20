import { randomBytes } from 'node:crypto';

import { SyncApi } from '../api';
import { serviceConfig } from '../config';
import { type Credentials, keyFromBytes } from '../links';
import type { OutgoingRecord } from '../records';

/**
 * Conversa de verdade com o serviço: cria um caderno de teste, envia e lê um
 * registro e um arquivo pequeno e, no fim, apaga tudo o que criou.
 */
describe('serviço da cópia na internet (rede real)', () => {
  const api = new SyncApi(serviceConfig());
  let cred: Credentials | null = null;

  afterAll(async () => {
    if (cred) await api.apagarTudo(cred);
  });

  it('cria, envia, lê e apaga', async () => {
    const chave = keyFromBytes(new Uint8Array(randomBytes(32)));
    expect(chave).toHaveLength(43);
    const conta = await api.criarConta(chave);
    cred = { conta, chave };
    console.log(`caderno de teste criado: ${conta}`);

    expect(await api.chaveConfere(cred)).toBe(true);
    expect(await api.chaveConfere({ conta, chave: keyFromBytes(new Uint8Array(randomBytes(32))) })).toBe(false);

    const agora = new Date().toISOString();
    const registro: OutgoingRecord = {
      tipo: 'anotacao',
      id: '00000000-0000-4000-8000-000000000001',
      dados: { crop: 'feijão', activity: 'colheita', quantity: 12, unit: 'kg' },
      atualizado_em: agora,
      apagado_em: null,
    };
    const r1 = await api.sincronizar(cred, 0, [registro]);
    expect(r1.mudancas).toHaveLength(1);
    expect(r1.mudancas[0]).toMatchObject({ tipo: 'anotacao', id: registro.id, dados: registro.dados });
    console.log(`registro enviado e lido de volta (seq ${r1.seq})`);

    // Idempotente: reenviar a mesma versão não gera nada novo depois do cursor.
    const r2 = await api.sincronizar(cred, r1.seq, [registro]);
    expect(r2.mudancas).toHaveLength(0);

    // Versão mais antiga perde; mais nova vence.
    const antiga = { ...registro, dados: { crop: 'velho' }, atualizado_em: '2020-01-01T00:00:00.000Z' };
    expect((await api.sincronizar(cred, r1.seq, [antiga])).mudancas).toHaveLength(0);
    const nova = { ...registro, dados: { crop: 'milho' }, atualizado_em: new Date(Date.now() + 1000).toISOString() };
    const r3 = await api.sincronizar(cred, r1.seq, [nova]);
    expect(r3.mudancas[0].dados).toEqual({ crop: 'milho' });

    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
    await api.uploadBytes(cred, 'anotacoes-teste.jpg', bytes, 'image/jpeg');
    expect(Array.from(await api.downloadBytes(cred, 'anotacoes-teste.jpg'))).toEqual(Array.from(bytes));
    expect(await api.listMedia(cred)).toEqual(['anotacoes-teste.jpg']);
    console.log('arquivo enviado, baixado e listado');

    await expect(
      api.sincronizar({ conta, chave: keyFromBytes(new Uint8Array(randomBytes(32))) }, 0, []),
    ).rejects.toMatchObject({ kind: 'chave' });

    await api.apagarTudo(cred);
    expect(await api.chaveConfere(cred)).toBe(false);
    cred = null;
    console.log('caderno de teste e arquivos apagados');
  });
});
