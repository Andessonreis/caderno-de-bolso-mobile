import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import path from 'node:path';

import { useApp } from '@/store';

// A primeira renderização carrega todas as rotas e pode passar de 5 s em máquina lenta.
jest.setTimeout(30000);

const APP_DIR = path.resolve(__dirname, '../app');

async function resetStore() {
  await act(() => {
    useApp.getState().resetAll();
    useApp.setState({ hydrated: true });
  });
}

describe('telas do app', () => {
  // Os testes de tela nunca falam com a internet (o teste real é o `npm run test:rede`).
  beforeAll(() => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('sem internet nos testes'))) as unknown as typeof fetch;
  });
  beforeEach(resetStore);

  it('primeiro uso leva às boas-vindas e carrega os dados de exemplo', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByText('Caderno de Bolso')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ver com dados de exemplo'));
    expect(await screen.findByText(/Zé!/)).toBeTruthy();
    expect(screen.getByText('Dados de exemplo')).toBeTruthy();
    expect(useApp.getState().entries.length).toBeGreaterThan(20);
  });

  it('anota uma colheita só tocando e mostra "Anotado!"', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    const before = useApp.getState().entries.length;
    await renderRouter(APP_DIR, { initialUrl: '/anotar' });

    expect(await screen.findByText('Onde foi?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Canteiro 1. Última usada'));
    expect(await screen.findByText('Qual cultura?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Alface'));
    expect(await screen.findByText('O que você fez?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Colheita'));
    expect(await screen.findByText('Quanto?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('1'));
    await fireEvent.press(screen.getByLabelText('2'));
    await fireEvent.press(screen.getByLabelText('Próximo'));
    expect(await screen.findByText('Confira e salve')).toBeTruthy();
    expect(screen.getByText('Hoje, no Canteiro 1: colheita de 12 unidades de alface')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Salvar anotação'));
    expect(await screen.findByText('Anotado!')).toBeTruthy();
    expect(useApp.getState().entries).toHaveLength(before + 1);

    const created = useApp.getState().entries.at(-1);
    expect(useApp.getState().pendingChanges.at(-1)).toMatchObject({ entity: 'anotacao', recordId: created?.id, op: 'upsert' });

    await fireEvent.press(screen.getByLabelText('Desfazer'));
    expect(await screen.findByText('Confira e salve')).toBeTruthy();
    // Apagar é "soft delete": o registro fica com deletedAt e sai das telas.
    expect(useApp.getState().entries.filter((e) => !e.deletedAt)).toHaveLength(before);
    expect(useApp.getState().entries.find((e) => e.id === created?.id)?.deletedAt).toEqual(expect.any(String));
    expect(useApp.getState().pendingChanges.at(-1)).toMatchObject({ recordId: created?.id, op: 'delete' });
  });

  it.each([
    ['/caderno', 'Caderno'],
    ['/resumos', 'Resumos'],
    ['/visita', 'Pronto para a visita'],
    ['/mais', 'Mais'],
    ['/ficha', 'Minha ficha'],
    ['/colheita-venda', 'Colheita e venda'],
    ['/copia-seguranca', 'Cópia de segurança'],
    ['/perfil', 'Meus dados'],
    ['/areas-culturas', 'Áreas e culturas'],
    ['/sobre', 'Sobre o Caderno de Bolso'],
  ])('abre %s com dados de exemplo', async (url, title) => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    await renderRouter(APP_DIR, { initialUrl: url });
    expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
  });

  it('caderno vazio explica o que fazer', async () => {
    await act(() => useApp.getState().completeOnboarding({ name: 'Ana' }, [{ id: 'a', name: 'Horta', updatedAt: '2026-11-01T00:00:00.000Z' }], ['alface']));
    await renderRouter(APP_DIR, { initialUrl: '/caderno' });
    expect(await screen.findByText('O caderno está vazio')).toBeTruthy();
    expect(screen.getByLabelText('Fazer a primeira anotação')).toBeTruthy();
  });

  it('tamanho de letra muda a tipografia', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    await renderRouter(APP_DIR, { initialUrl: '/mais' });
    const before = screen.getByText('Ajustes e outras partes do app.');
    const sizeBefore = (before.props.style as { fontSize: number }[]).flat().find((s) => s?.fontSize)?.fontSize;
    await fireEvent.press(screen.getByLabelText('Muito grande'));
    const after = await screen.findByText('Ajustes e outras partes do app.');
    const sizeAfter = (after.props.style as { fontSize: number }[]).flat().find((s) => s?.fontSize)?.fontSize;
    expect(sizeBefore).toBe(18);
    expect(sizeAfter).toBe(Math.round(18 * 1.3));
  });

  it('endereço inexistente mostra aviso em português com volta ao início', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    await renderRouter(APP_DIR, { initialUrl: '/rota-que-nao-existe' });
    expect(await screen.findByText('Essa tela não existe')).toBeTruthy();
    expect(screen.getByLabelText('Voltar para o início')).toBeTruthy();
  });

  it('editar anotação passada a limpo volta a ficar pendente e o desfazer restaura', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    const original = useApp.getState().entries.find((e) => e.copied && e.date === '2026-10-31');
    if (!original) throw new Error('dados de exemplo sem anotação passada a limpo');
    await renderRouter(APP_DIR, { initialUrl: `/anotar?id=${original.id}` });
    expect(await screen.findByText('Mudar anotação')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ontem'));
    await fireEvent.press(screen.getByLabelText('Salvar alteração'));
    expect(await screen.findByText(/voltou para "falta passar para o caderno"/)).toBeTruthy();
    expect(useApp.getState().entries.find((e) => e.id === original.id)?.copied).toBe(false);
    await fireEvent.press(screen.getByLabelText('Desfazer'));
    expect(useApp.getState().entries.find((e) => e.id === original.id)).toMatchObject({
      ...original,
      updatedAt: expect.any(String),
    });
  });

  it('mudar a data da visita pergunta e zera os itens marcados à mão', async () => {
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().setManualCheck('notas', true);
    });
    await renderRouter(APP_DIR, { initialUrl: '/visita' });
    await fireEvent.press(await screen.findByLabelText('Informar a data'));
    await fireEvent.press(screen.getByLabelText('Pronto'));
    expect(await screen.findByText('Desmarcar os itens que você marcou?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sim, desmarcar'));
    expect(useApp.getState().manualChecks).toEqual({});
  });

  it('cópia na internet pergunta antes de ligar', async () => {
    await act(() => useApp.getState().completeOnboarding({ name: 'Ana' }, [{ id: 'a', name: 'Horta', updatedAt: '2026-11-01T00:00:00.000Z' }], ['alface']));
    await renderRouter(APP_DIR, { initialUrl: '/copia-internet' });
    expect(await screen.findByText('Quer guardar uma cópia na internet para não perder se o celular quebrar?')).toBeTruthy();
    expect(screen.getAllByText('Guardado só neste celular').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Sim, guardar na internet'));
    expect(useApp.getState().sync.ligado).toBe(true);
    expect(await screen.findByText('Ligar outro celular')).toBeTruthy();
  });

  it('ligar outro celular recusa código errado e abre a confirmação pelo link', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/ligar' });
    expect(await screen.findByText('Já tenho um caderno')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Ou cole o código'), 'codigo-errado');
    await fireEvent.press(screen.getByLabelText('Usar este código'));
    expect(await screen.findByText(/não é de um Caderno de Bolso/)).toBeTruthy();
  });

  it('o link cadernodebolso://ligar abre direto a confirmação', async () => {
    const chave = 'A'.repeat(43);
    await renderRouter(APP_DIR, { initialUrl: `/ligar?c=3f1b2c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d&k=${chave}` });
    expect(await screen.findByText('Ligar este celular?')).toBeTruthy();
    expect(screen.getByLabelText('Sim, ligar este celular')).toBeTruthy();
  });
});
