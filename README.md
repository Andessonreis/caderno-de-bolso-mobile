# Caderno de Bolso (app)

Aplicativo de celular que ajuda agricultores familiares agroecológicos a manter o caderno de campo em dia. Ele é um ajudante do caderno de papel, não um substituto: serve para anotar na hora, sem esquecer, e depois passar a limpo mais rápido.

Projeto da disciplina de Empreendedorismo do curso de Análise e Desenvolvimento de Sistemas do IFBA, campus Irecê (equipe Rastreabilidade de Grãos).

## Para quem é

Agricultores do Território de Irecê (BA) certificados por sistema participativo de garantia, que plantam milho crioulo, feijão e hortaliças. Eles já mantêm um caderno de campo que é conferido nas visitas de pares e entregam a declaração de transação ao comprador.

Nas entrevistas apareceram quatro dores:

- **Anotar duas vezes.** A pessoa anota num papel solto ou no celular e depois passa tudo para o caderno. Tem produtor que gasta 5 a 6 horas por semana nisso.
- **Caderno que molha ou se perde.** Não existe cópia.
- **Provar a cada venda que é orgânico.** Hoje isso se resolve mostrando foto ou chamando o comprador para ir à roça.
- **Preparar a visita de pares.** É difícil saber o que falta antes da visita.

## Restrições que guiaram o desenho

Elas vieram dos próprios entrevistados:

- **Funciona 100% sem internet.** Não tem servidor, login nem conta. Os dados ficam só no aparelho.
- **Anotar tocando, não digitando.** Escolhe a área, a cultura e a atividade com toques e digita só a quantidade, num teclado numérico grande do próprio app. Aplicativos anteriores foram rejeitados por serem "complexos".
- **Resumos por conta simples.** Eles só agrupam e somam o que foi anotado, então funcionam sem internet e dá para conferir à mão.
- **Não substituir o caderno.** O resumo vem na mesma ordem dos campos do caderno de campo (data, área, cultura, atividade, insumo ou semente e origem, quantidade), para copiar mais rápido. Cada linha tem a caixa "Passei para o caderno".

### Interface para quem tem pouca familiaridade com celular

- Português do dia a dia ("roça", "canteiro", "passar a limpo"), sem termos em inglês.
- Alvos de toque de pelo menos 56 dp, letra base de 18, fundo claro e texto escuro para ler no sol. Todo ícone vem com texto.
- No fluxo de anotar, cada tela pede uma decisão só, tem barra de passos e o botão "Voltar" está sempre visível. Ao escolher uma opção, o app já passa para a próxima tela.
- O app lembra a última área usada e coloca as culturas mais usadas no topo. Se a roça tem uma área só, o passo da área é pulado.
- Ao salvar aparece a tela "Anotado!", com vibração e o botão "Desfazer". Apagar sempre pede confirmação e também pode ser desfeito.
- Tamanho de letra em Mais: normal, grande ou muito grande. A escolha multiplica toda a tipografia do app e respeita o tamanho de letra do sistema (com limite para não quebrar as telas).
- Paleta própria em tons de papel, terra e verde-folha, definida em `src/theme/index.ts`.

Uma anotação comum (colheita, numa roça com uma área só) leva quatro toques mais os números: cultura, atividade, "Próximo" depois da quantidade e "Salvar".

## O que o app faz

**Primeiro uso.** Três passos: nome e município; cooperativa e dados do certificado (todos opcionais); áreas da roça e culturas, escolhidas numa lista pronta. Também dá para entrar com **dados de exemplo**: um produtor fictício, Zé Carlos, de Canarana-BA, com cerca de três semanas de anotações. Para tirar, use Mais > "Apagar dados de exemplo". Saem só as anotações de exemplo; o que você mesmo anotou continua, inclusive numa área de exemplo, que passa a ser sua.

**Módulo 1: anotação e controle**

- **Início:** botão "Anotar agora", resumo da semana, progresso para a visita e atalho para a ficha.
- **Anotar:** área, cultura, atividade e os detalhes de cada atividade (origem da semente, insumo e origem, quantidade e unidade, valor, destino da venda). Na revisão a anotação aparece numa frase ("Hoje, no Canteiro 1: colheita de 12 kg de feijão"), com data (Hoje, Ontem ou Outro dia), observação e foto opcional.
- **Caderno:** histórico por dia, com filtro por área, cultura e atividade. Dá para mudar e apagar.
- **Resumos:** semana ou mês, com setas para navegar entre períodos. Agrupa por área e cultura na ordem do caderno de campo, com somas por unidade. Tem as caixas "Passei para o caderno", o botão para marcar o período todo e a geração de PDF para compartilhar ou imprimir.
- **Colheita e venda:** por cultura, quanto colheu, quanto vendeu e quanto recebeu no período. O que sobrou é acumulado: toda colheita menos toda venda anotadas até o fim do período, na mesma unidade. Assim, colher no domingo e vender na segunda não aparece como venda a mais. O aviso de venda maior que colheita também usa o acumulado. As barras são simples, sem biblioteca de gráfico.
- **Cópia de segurança:** fotos das páginas do caderno de papel, organizadas por data, com legenda, tela cheia e opção de apagar. "Exportar meus dados" gera um arquivo JSON para compartilhar; "Importar" traz esse arquivo de volta. Fotos de anotação que não existem no aparelho ficam de fora, e um arquivo com problema mostra uma mensagem em vez de travar o app. É o backup sem nuvem.
- **Minha ficha (QR):** QR grande com a prévia do que vai na ficha. Tem "Compartilhar link" e "Imprimir cartão", um PDF com QR, nome, cooperativa e a frase "Aponte a câmera do celular para conhecer quem produziu".

**Módulo 2: visita de pares**

- **Pronto para a visita:** lista de apoio com itens que o app confere sozinho (caderno em dia, origem das sementes com destaque para milho e feijão, insumos com origem, colheitas e vendas, cópia de segurança nos últimos 30 dias) e itens que o produtor marca (notas e recibos, declarações de transação, plano de manejo, separação no armazenamento e transporte, pendências da última visita). Cada item automático explica o que foi conferido e o que falta. "Compartilhar resumo para a visita" gera um PDF com os dados do produtor, a lista e as anotações desde a última visita, cuja data pode ser informada.
- A lista não é o roteiro oficial de nenhuma certificadora e não usa nome nem logotipo de organizações reais.

## Como rodar

Requisitos: Node 20 ou mais novo e o app Expo Go no celular (ou um emulador Android).

```bash
npm install
npx expo start
```

Leia o QR do terminal com o Expo Go. Para testar a interface no navegador, use `npx expo start --web`. Câmera, fotos, exportação e importação só funcionam no celular.

Outros comandos:

```bash
npm test            # testes da lógica (jest-expo)
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npx expo-doctor     # confere dependências e configuração
```

### Endereço do site da ficha

O QR aponta para o site que mostra a ficha do produtor. O endereço vem de `EXPO_PUBLIC_WEB_URL`. Se ela não estiver definida, o app usa `https://andessonreis.github.io/caderno-de-bolso-web` (o site publicado no GitHub Pages). Uma barra no final do endereço é ignorada. Para trocar, copie `.env.example` para `.env` e ajuste o valor.

## Estrutura

```
src/
  app/              rotas (expo-router)
    (tabs)/         Início, Caderno, Anotar (botão central), Resumos, Visita, Mais
    anotar.tsx      passo a passo de anotar (criar e editar)
    boas-vindas.tsx primeiro uso
    ficha.tsx, copia-seguranca.tsx, colheita-venda.tsx, perfil.tsx, areas-culturas.tsx, sobre.tsx
  components/       peças de interface (botões, opções grandes, teclado numérico...)
  lib/              lógica de domínio em funções puras, mais device.ts (câmera, arquivos, PDF)
    __tests__/      testes unitários
  store/            estado e persistência (zustand + AsyncStorage)
  theme/            cores, espaçamentos e tipografia
```

A lógica que importa (datas, resumos, saldo de colheita e venda, lista da visita, ficha, validação da importação, HTML dos PDFs) fica em `src/lib` como funções puras, cobertas por testes.

### Por que zustand + AsyncStorage e não SQLite

O volume de dados é pequeno: um produtor faz algumas anotações por dia, o que dá poucos milhares de registros por ano. Os resumos são filtros e somas em memória, que rodam instantâneos nesse tamanho. Guardar o estado inteiro como JSON no AsyncStorage deixa a exportação e a importação triviais (o arquivo de cópia é o mesmo formato) e evita migrações de esquema num protótipo. Se o app crescer para vários anos de dados ou para consultas mais pesadas, a troca para `expo-sqlite` fica concentrada em `src/store`.

As fotos não vão para o AsyncStorage. Elas são copiadas para a pasta de documentos do app com `expo-file-system`, e o estado guarda só o caminho relativo (ex.: `anotacoes/1732.jpg`). O endereço completo é montado na hora de mostrar, porque a pasta do app pode mudar entre atualizações. Dados salvos pela versão anterior, que guardava o endereço completo, são convertidos na abertura (`src/lib/migrate.ts`).

## Contrato da ficha (QR)

URL: `${EXPO_PUBLIC_WEB_URL}/ficha/#d=<payload>`

A barra antes do `#` é proposital: o site é exportado com barra no final das rotas.

`payload` é o base64url (sem `=` no final, com `-` e `_`) dos bytes UTF-8 de `JSON.stringify(obj)`:

| chave | conteúdo | obrigatória |
| --- | --- | --- |
| `v` | versão do formato (número, hoje `1`) | sim |
| `n` | nome do produtor | sim |
| `m` | município | não |
| `c` | cooperativa ou núcleo | não |
| `o` | organismo de certificação (OPAC) | não |
| `ct` | identificação do certificado | não |
| `d` | certificado desde (ano, número) | não |
| `r` | registro no cadastro nacional de produtores orgânicos | não |
| `s` | código do sistema de rastreio que já usa | não |
| `cu` | culturas (lista, no máximo 12) | não |
| `u` | data da última anotação (AAAA-MM-DD) | não |

Chaves vazias são omitidas. Fotos não entram, porque não cabem num QR. O QR usa nível de correção M. A implementação está em `src/lib/ficha.ts` (`encodeFicha`, `decodeFicha`, `fichaUrl`), com testes de ida e volta que incluem acentos e conferem o resultado contra o `Buffer` do Node.

## Limitações conhecidas

- É um protótipo acadêmico. Não passou por teste de campo prolongado.
- Não sincroniza entre aparelhos. A única forma de levar os dados para outro celular é exportar e importar o arquivo, e as fotos não vão junto.
- Se o app for desinstalado sem uma exportação recente, os dados se perdem.
- A pessoa que lê o QR precisa de internet para abrir a ficha no site. Quem mostra o QR não precisa.
- A lista da visita é de apoio. Ela não substitui o roteiro do grupo nem a conferência feita pelos pares.
- No navegador, câmera, fotos e exportação não funcionam; o alvo é o celular Android.
- Não tem gravação de áudio. Ela ficou de fora para não entregar uma função pela metade.
