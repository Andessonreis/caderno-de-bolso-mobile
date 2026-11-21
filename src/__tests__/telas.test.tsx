import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import path from 'node:path';
import { AppState, BackHandler, Linking } from 'react-native';

import { encodeFicha } from '@/lib/ficha';
import { type Visita, novaVisita } from '@/lib/roteiro';
import { useGroupStatus } from '@/sync/service';
import { useApp } from '@/store';

// A primeira renderização carrega todas as rotas e pode passar de 5 s em máquina lenta.
jest.setTimeout(30000);

const APP_DIR = path.resolve(__dirname, '../app');

type DubleCamera = {
  permissao: { granted: boolean; canAskAgain: boolean; status: string };
  props: { onBarcodeScanned?: (r: { data: string }) => void } | null;
};
const { dubleCamera } = jest.requireMock('expo-camera') as { dubleCamera: DubleCamera };

const semInternet = () => Promise.reject(new TypeError('sem internet nos testes'));

/** Serviço do grupo de mentira: conhece só o código ABCDE-23456. */
function servidorDoGrupo() {
  const recebidas: string[] = [];
  jest.mocked(global.fetch).mockImplementation(async (url, init) => {
    const body = JSON.parse(String(init?.body)) as { p_codigo: string; p_visitas?: { id: string }[] };
    const conhecido = body.p_codigo === 'ABCDE23456';
    if (String(url).endsWith('/caderno_grupo_conferir') && conhecido)
      return new Response(JSON.stringify({ nome: 'Núcleo Pé de Serra' }), { status: 200 });
    if (String(url).endsWith('/caderno_grupo_enviar') && conhecido) {
      recebidas.push(...(body.p_visitas ?? []).map((v) => v.id));
      return new Response(JSON.stringify({ recebidas: body.p_visitas?.length ?? 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: '28000', message: 'grupo_nao_encontrado' }), { status: 401 });
  });
  return recebidas;
}

function visitaDe(nome: string): Visita {
  const v = novaVisita(new Date('2026-11-20T10:00:00'));
  v.produtor.nome = nome;
  return v;
}

async function resetStore() {
  await act(() => {
    useApp.getState().resetAll();
    useApp.setState({ hydrated: true });
  });
}

describe('telas do app', () => {
  // Os testes de tela nunca falam com a internet (o teste real é o `npm run test:rede`).
  beforeAll(() => {
    global.fetch = jest.fn(semInternet) as unknown as typeof fetch;
  });
  beforeEach(resetStore);
  afterEach(() => {
    jest.mocked(global.fetch).mockImplementation(semInternet);
    useGroupStatus.setState({ fase: 'parado' });
  });

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

  it('aba Visita mostra os dois lados e começa uma visita a outra roça', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    await renderRouter(APP_DIR, { initialUrl: '/visita' });
    expect(await screen.findByLabelText('Minha roça. Me preparar para receber a visita')).toBeTruthy();
    expect(screen.getByText('Pronto para a visita')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Visitar outra roça. Para quando você vai visitar outro produtor'));
    expect(await screen.findByText('Nenhuma visita ainda')).toBeTruthy();
    expect(screen.getByText(/visitar a roça de outro produtor/)).toBeTruthy();
    expect(screen.getByText(/Não substitui o roteiro nem os documentos oficiais/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Começar uma visita'));
    expect(await screen.findByText('Quem e quando')).toBeTruthy();
    expect(useApp.getState().peerVisits).toHaveLength(1);
    const id = useApp.getState().peerVisits[0].id;
    expect(useApp.getState().pendingChanges.at(-1)).toMatchObject({ entity: 'visita_par', recordId: id });

    await fireEvent.changeText(screen.getByLabelText('Nome do produtor visitado'), 'Maria da Silva');
    // O texto vai para o celular depois de uma pausa curta, não a cada letra.
    expect(useApp.getState().peerVisits[0].produtor.nome).toBe('');
    expect(await screen.findByText('Salvo neste celular')).toBeTruthy();
    expect(useApp.getState().peerVisits[0].produtor.nome).toBe('Maria da Silva');
    expect(screen.getByText('Visita a Maria da Silva')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Próxima etapa'));
    expect(await screen.findByText('Documentos')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Em parte')[0]);
    expect(useApp.getState().peerVisits[0].respostas.doc_caderno).toEqual({ obs: '', r: 'parte' });

    await fireEvent.press(screen.getByLabelText('Resumo da visita'));
    expect(await screen.findByText(/Faltam \d+ respostas/)).toBeTruthy();
    expect(screen.getByLabelText('Gerar PDF da visita')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Responder agora')[0]);
    expect(await screen.findByText('Quem e quando')).toBeTruthy();
  });

  it('pergunta da separação só aparece com armazém compartilhado', async () => {
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    await fireEvent.press(await screen.findByLabelText('Etapa 5: Colheita, armazenamento e transporte'));
    expect(await screen.findByText('A colheita está anotada no caderno?')).toBeTruthy();
    expect(screen.queryByText('A separação do produto orgânico está sendo feita e anotada?')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Compartilhados com convencional'));
    expect(await screen.findByText('A separação do produto orgânico está sendo feita e anotada?')).toBeTruthy();
    expect(screen.getByLabelText('Como a separação é feita e registrada?')).toBeTruthy();
  });

  it('link da ficha colado preenche o produtor e marca as culturas sensíveis', async () => {
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    const ficha = encodeFicha({ v: 1, n: 'João Pereira', m: 'Lapão', cu: ['Feijão de corda'] });
    const link = `https://exemplo.github.io/ficha/#d=${ficha}`;
    await fireEvent.changeText(await screen.findByLabelText('Ou cole o link da ficha'), 'link-cortado!');
    await fireEvent.press(screen.getByLabelText('Usar dados da ficha'));
    expect(await screen.findByText(/Não conseguimos ler esta ficha/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Ou cole o link da ficha'), link);
    await fireEvent.press(screen.getByLabelText('Usar dados da ficha'));
    expect(await screen.findByText('Dados de João Pereira preenchidos.')).toBeTruthy();
    expect(useApp.getState().peerVisits[0]).toMatchObject({
      produtor: { nome: 'João Pereira', municipio: 'Lapão', culturas: ['Feijão de corda'] },
      culturasSensiveis: ['feijão'],
    });
  });

  it('apagar uma visita pede confirmação e dá para desfazer', async () => {
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    v.produtor.nome = 'Rosa';
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: '/visita?modo=outra' });
    expect(await screen.findByText('Rosa')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Apagar'));
    expect(await screen.findByText('Apagar esta visita?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sim, apagar'));
    expect(useApp.getState().peerVisits[0].deletedAt).toEqual(expect.any(String));
    expect(await screen.findByText('Nenhuma visita ainda')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Desfazer'));
    expect(useApp.getState().peerVisits[0].deletedAt).toBeUndefined();
    expect(await screen.findByText('Rosa')).toBeTruthy();
  });

  it('texto digitado é salvo ao sair do campo, ao ir para segundo plano e ao trocar de etapa', async () => {
    // O AppState dos testes já é um dublê: só olhamos quem se inscreveu nesta tela.
    const appState = jest.spyOn(AppState, 'addEventListener');
    const antes = appState.mock.calls.length;
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    const atual = () => useApp.getState().peerVisits.find((x) => x.id === v.id)!;

    const nome = await screen.findByLabelText('Nome do produtor visitado');
    await fireEvent.changeText(nome, 'Rosa');
    expect(atual().produtor.nome).toBe('');
    await fireEvent(nome, 'blur');
    expect(atual().produtor.nome).toBe('Rosa');

    await fireEvent.changeText(screen.getByLabelText('Município'), 'Irecê');
    await act(() => {
      for (const [, aoMudar] of appState.mock.calls.slice(antes)) aoMudar('background');
    });
    expect(atual().produtor.municipio).toBe('Irecê');

    await fireEvent.changeText(screen.getByLabelText('Quem está visitando'), 'Ana e Joel');
    await fireEvent.press(screen.getByLabelText('Próxima etapa'));
    expect(await screen.findByText('Documentos')).toBeTruthy();
    expect(atual().visitantes).toBe('Ana e Joel');

    // Resposta tocada enquanto a observação espera: as duas ficam.
    await fireEvent.press(screen.getAllByLabelText('Anotar observação')[0]);
    await fireEvent.changeText(screen.getByLabelText('Observação'), 'Faltam duas semanas');
    await fireEvent.press(screen.getAllByLabelText('Em parte')[0]);
    expect(atual().respostas.doc_caderno).toEqual({ obs: '', r: 'parte' });
    await waitFor(() => expect(atual().respostas.doc_caderno).toEqual({ obs: 'Faltam duas semanas', r: 'parte' }));
  });

  it('mostra quantas letras ainda cabem perto do limite', async () => {
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    const nome = await screen.findByLabelText('Nome do produtor visitado');
    expect(screen.queryByText(/Ainda cabe/)).toBeNull();
    await fireEvent.changeText(nome, 'a'.repeat(70));
    expect(screen.getByText('Ainda cabem 10 letras')).toBeTruthy();
    await fireEvent.changeText(nome, 'a'.repeat(79));
    expect(screen.getByText('Ainda cabe 1 letra')).toBeTruthy();
  });

  it('visita deixada vazia é apagada ao sair; com texto esperando para salvar, fica', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    await renderRouter(APP_DIR, { initialUrl: '/visita?modo=outra' });
    await fireEvent.press(await screen.findByLabelText('Começar uma visita'));
    expect(await screen.findByText('Quem e quando')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Lista de visitas'));
    expect(await screen.findByText('Nenhuma visita ainda')).toBeTruthy();
    expect(useApp.getState().peerVisits.every((x) => x.deletedAt)).toBe(true);

    await fireEvent.press(screen.getByLabelText('Começar uma visita'));
    await fireEvent.changeText(await screen.findByLabelText('Nome do produtor visitado'), 'Joana');
    await fireEvent.press(screen.getByLabelText('Lista de visitas'));
    expect(await screen.findByText('Joana')).toBeTruthy();
    const vivas = useApp.getState().peerVisits.filter((x) => !x.deletedAt);
    expect(vivas.map((x) => x.produtor.nome)).toEqual(['Joana']);
  });

  it('câmera: voltar do celular fecha a câmera e código que não é ficha avisa uma vez', async () => {
    const back = jest.spyOn(BackHandler, 'addEventListener');
    const antes = back.mock.calls.length;
    dubleCamera.permissao = { granted: true, canAskAgain: true, status: 'granted' };
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    await fireEvent.press(await screen.findByLabelText('Ler o QR da ficha com a câmera'));
    expect(await screen.findByText('Aponte para o QR da ficha do produtor')).toBeTruthy();

    await act(() => dubleCamera.props?.onBarcodeScanned?.({ data: 'https://exemplo.com/outra-coisa' }));
    await act(() => dubleCamera.props?.onBarcodeScanned?.({ data: 'https://exemplo.com/outra-coisa' }));
    expect(screen.getAllByText('Este código não é de uma ficha do Caderno de Bolso.')).toHaveLength(1);

    const voltar = back.mock.calls.slice(antes).map((c) => c[1]).at(-1)!;
    let tratado: boolean | undefined;
    await act(() => {
      tratado = voltar({ type: 'hardwareBackPress', timeStamp: 0 });
    });
    expect(tratado).toBe(true);
    expect(await screen.findByText('Quem e quando')).toBeTruthy();
    expect(screen.queryByText('Aponte para o QR da ficha do produtor')).toBeNull();
    back.mockRestore();
    dubleCamera.permissao = { granted: false, canAskAgain: false, status: 'denied' };
  });

  it('câmera negada de vez oferece abrir as configurações', async () => {
    // Linking dos testes já é um dublê: conferimos só a chamada feita aqui.
    const abrir = jest.mocked(Linking.openSettings);
    const antes = abrir.mock.calls.length;
    dubleCamera.permissao = { granted: false, canAskAgain: false, status: 'denied' };
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    await fireEvent.press(await screen.findByLabelText('Ler o QR da ficha com a câmera'));
    expect(await screen.findByText(/precisa da permissão da câmera/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Abrir configurações'));
    expect(abrir.mock.calls.length).toBe(antes + 1);
  });

  it('a aba Visita troca de lado quando o link pede outro modo', async () => {
    await act(() => useApp.getState().loadSample('2026-11-20'));
    await renderRouter(APP_DIR, { initialUrl: '/visita' });
    expect(await screen.findByText('Pronto para a visita')).toBeTruthy();
    await act(() => router.navigate({ pathname: '/visita', params: { modo: 'outra' } }));
    expect(await screen.findByText('Nenhuma visita ainda')).toBeTruthy();
  });

  it('visita grande demais para a internet ganha um aviso na lista e no resumo', async () => {
    const v = novaVisita(new Date('2026-11-20T10:00:00'));
    v.produtor.nome = 'Rosa';
    v.observacoes = '…'.repeat(11_000);
    await act(() => {
      useApp.getState().loadSample('2026-11-20');
      useApp.getState().savePeerVisit(v);
      useApp.setState((st) => ({ sync: { ...st.sync, ligado: true, perguntado: true } }));
    });
    const aviso = 'Esta visita ficou grande demais para a cópia na internet. Ela continua guardada neste celular.';
    await renderRouter(APP_DIR, { initialUrl: '/visita?modo=outra' });
    expect(await screen.findByText(aviso)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Continuar'));
    await fireEvent.press(await screen.findByLabelText('Resumo da visita'));
    expect(await screen.findByText(aviso)).toBeTruthy();
  });
  it('entra no grupo pelo código, com confirmação, e avisa sem internet ou código errado', async () => {
    await act(() => useApp.getState().completeOnboarding({ name: 'Ana' }, [], []));
    await renderRouter(APP_DIR, { initialUrl: '/visita?modo=outra' });
    expect(await screen.findByText('Enviar as visitas para o grupo')).toBeTruthy();
    const campo = screen.getByLabelText('Código do grupo');

    await fireEvent.changeText(campo, 'abc');
    await fireEvent.press(screen.getByLabelText('Entrar no grupo'));
    expect(await screen.findByText(/O código tem 10 letras e números/)).toBeTruthy();

    await fireEvent.changeText(campo, 'abcde 23456');
    expect(screen.getByDisplayValue('ABCDE-23456')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Entrar no grupo'));
    expect(await screen.findByText(/Sem internet agora/)).toBeTruthy();
    expect(useApp.getState().grupo).toBeNull();

    servidorDoGrupo();
    await fireEvent.changeText(campo, 'XYZWV-23456');
    await fireEvent.press(screen.getByLabelText('Entrar no grupo'));
    expect(await screen.findByText(/não é de nenhum grupo/)).toBeTruthy();

    await fireEvent.changeText(campo, 'cadernodebolso://grupo?c=ABCDE-23456');
    expect(screen.getByDisplayValue('ABCDE-23456')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Entrar no grupo'));
    expect(await screen.findByText(/Quem coordena o grupo vai ver o que foi preenchido, inclusive o nome do produtor/)).toBeTruthy();
    expect(useApp.getState().grupo).toBeNull();
    await fireEvent.press(screen.getByLabelText('Sim'));
    expect(useApp.getState().grupo).toMatchObject({ codigo: 'ABCDE23456', nome: 'Núcleo Pé de Serra' });
    expect(await screen.findByText('Tudo enviado ao grupo')).toBeTruthy();
    expect(screen.getByText('Grupo: Núcleo Pé de Serra')).toBeTruthy();
  });

  it('mostra o que já foi para o grupo e sai do grupo com confirmação', async () => {
    await act(() => {
      useApp.getState().completeOnboarding({ name: 'Ana' }, [], []);
      useApp.getState().savePeerVisit(visitaDe('Rosa'));
      useApp.getState().savePeerVisit(visitaDe('Joana'));
      useApp.getState().joinGroup('ABCDE23456', 'Núcleo Pé de Serra');
      const rosa = useApp.getState().peerVisits.find((v) => v.produtor.nome === 'Rosa')!;
      useApp.getState().markSentToGroup('ABCDE23456', [
        { id: rosa.id, dados: {}, atualizado_em: rosa.updatedAt, apagado_em: null },
      ]);
    });
    await renderRouter(APP_DIR, { initialUrl: '/visita?modo=outra' });
    expect(await screen.findByText('Grupo: Núcleo Pé de Serra')).toBeTruthy();
    expect(screen.getAllByText('Enviada ao grupo')).toHaveLength(1);
    expect(screen.getAllByText('Falta enviar ao grupo')).toHaveLength(1);
    // O celular dos testes está sem internet.
    expect(await screen.findByText('Sem internet: envio depois')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Sair do grupo'));
    expect(await screen.findByText(/O que já foi enviado continua com a coordenação do grupo/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sim, sair do grupo'));
    expect(useApp.getState().grupo).toBeNull();
    expect(useApp.getState().grupoEnviadas).toEqual({});
    expect(useApp.getState().peerVisits.filter((v) => !v.deletedAt)).toHaveLength(2);
    expect(await screen.findByText('Enviar as visitas para o grupo')).toBeTruthy();
    expect(screen.queryByText('Enviada ao grupo')).toBeNull();
  });

  it('resumo da visita diz se ela já foi para o grupo', async () => {
    const v = visitaDe('Rosa');
    await act(() => {
      useApp.getState().completeOnboarding({ name: 'Ana' }, [], []);
      useApp.getState().savePeerVisit(v);
      useApp.getState().joinGroup('ABCDE23456', 'Núcleo Pé de Serra');
    });
    await renderRouter(APP_DIR, { initialUrl: `/visita-par/${v.id}` });
    await fireEvent.press(await screen.findByLabelText('Resumo da visita'));
    expect(await screen.findByText('Falta enviar ao grupo')).toBeTruthy();
  });

  it('grupo não encontrado pede o código de novo sem apagar nada', async () => {
    await act(() => {
      useApp.getState().completeOnboarding({ name: 'Ana' }, [], []);
      useApp.getState().savePeerVisit(visitaDe('Rosa'));
      useApp.getState().joinGroup('ABCDE23456', 'Núcleo Pé de Serra');
      useGroupStatus.setState({ fase: 'nao_encontrado' });
    });
    await renderRouter(APP_DIR, { initialUrl: '/visita?modo=outra' });
    expect(await screen.findByText(/não vale mais/)).toBeTruthy();
    expect(screen.getByLabelText('Código do grupo')).toBeTruthy();
    expect(screen.getByText('Rosa')).toBeTruthy();
    expect(useApp.getState().grupo?.codigo).toBe('ABCDE23456');
  });

  it('o link cadernodebolso://grupo abre a tela com o código, também com a tela já aberta', async () => {
    await act(() => useApp.getState().completeOnboarding({ name: 'Ana' }, [], []));
    servidorDoGrupo();
    await renderRouter(APP_DIR, { initialUrl: '/grupo?c=XYZWV-23456' });
    expect(await screen.findByDisplayValue('XYZWV-23456')).toBeTruthy();
    await act(() => router.navigate({ pathname: '/grupo', params: { c: 'ABCDE-23456' } }));
    expect(await screen.findByDisplayValue('ABCDE-23456')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Entrar no grupo'));
    await fireEvent.press(await screen.findByLabelText('Sim'));
    expect(await screen.findByText('Pronto!')).toBeTruthy();
    expect(useApp.getState().grupo?.nome).toBe('Núcleo Pé de Serra');
  });

  it('lê o código do grupo com a câmera', async () => {
    dubleCamera.permissao = { granted: true, canAskAgain: true, status: 'granted' };
    await act(() => useApp.getState().completeOnboarding({ name: 'Ana' }, [], []));
    await renderRouter(APP_DIR, { initialUrl: '/grupo' });
    await fireEvent.press(await screen.findByLabelText('Ler o código com a câmera'));
    expect(await screen.findByText('Aponte para o código do grupo')).toBeTruthy();
    await act(() => dubleCamera.props?.onBarcodeScanned?.({ data: 'https://exemplo.com/outra-coisa' }));
    expect(screen.getByText('Aponte para o código do grupo')).toBeTruthy();
    await act(() => dubleCamera.props?.onBarcodeScanned?.({ data: 'cadernodebolso://grupo?c=ABCDE-23456' }));
    expect(await screen.findByDisplayValue('ABCDE-23456')).toBeTruthy();
    dubleCamera.permissao = { granted: false, canAskAgain: false, status: 'denied' };
  });
});
