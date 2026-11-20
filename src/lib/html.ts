// Gera o HTML dos PDFs (resumo, cartão da ficha, resumo para a visita e
// folha do roteiro de visita a outro produtor).
// Funções puras: recebem dados prontos e devolvem uma string.

import type { CheckItem } from './checklist';
import { formatLongDate, formatShortDate } from './dates';
import { ETAPAS, OPCOES_PARECER, OPCOES_TIPO, ROTULO_RESPOSTA, type Visita, itensDaEtapa } from './roteiro';
import type { Summary } from './summary';
import { totalText } from './summary';
import type { Profile } from './types';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f1a14; margin: 28px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 22px 0 6px; border-bottom: 2px solid #2f5d34; padding-bottom: 3px; }
  h3 { font-size: 14px; margin: 14px 0 4px; }
  p { margin: 4px 0; }
  .muted { color: #5a5045; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #b9ad98; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #efe7d6; font-size: 12px; }
  .ok { color: #2f5d34; font-weight: bold; }
  .falta { color: #9a3412; font-weight: bold; }
  .totais { margin: 4px 0 0; font-style: italic; }
  footer { margin-top: 28px; font-size: 11px; color: #5a5045; }
  .texto { white-space: pre-wrap; }
  .marca { display: inline-block; width: 18px; height: 18px; border: 1px solid #1f1a14; margin-right: 8px; text-align: center; line-height: 18px; font-weight: bold; }
  .assinaturas { width: 100%; margin-top: 56px; border: 0; }
  .assinaturas td { border: 0; border-top: 1px solid #1f1a14; padding-top: 4px; text-align: center; font-size: 12px; width: 30%; }
  .assinaturas td.vao { border-top: 0; width: 5%; }
`;

const DEFAULT_FOOTER =
  'Feito com o Caderno de Bolso. Este resumo ajuda a passar a limpo; o caderno de campo continua sendo o registro oficial.';

function page(title: string, body: string, footer: string = DEFAULT_FOOTER): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head><body>${body}<footer>${escapeHtml(footer)}</footer></body></html>`;
}

export function profileLines(p: Profile | null): string {
  if (!p) return '';
  const lines: string[] = [`<p><strong>${escapeHtml(p.name)}</strong>${p.municipality ? ` · ${escapeHtml(p.municipality)}` : ''}</p>`];
  if (p.cooperative) lines.push(`<p>Cooperativa ou núcleo: ${escapeHtml(p.cooperative)}</p>`);
  const cert: string[] = [];
  if (p.opac) cert.push(`Certificadora (OPAC): ${escapeHtml(p.opac)}`);
  if (p.certificateId) cert.push(`Certificado: ${escapeHtml(p.certificateId)}`);
  if (p.certifiedSince) cert.push(`desde ${p.certifiedSince}`);
  if (cert.length) lines.push(`<p>${cert.join(' · ')}</p>`);
  if (p.nationalRegistry) lines.push(`<p>Cadastro nacional de produtores orgânicos: ${escapeHtml(p.nationalRegistry)}</p>`);
  return lines.join('');
}

export function summaryTables(summary: Summary): string {
  if (!summary.groups.length) return '<p class="muted">Nenhuma anotação neste período.</p>';
  return summary.groups
    .map((g) => {
      const crops = g.crops
        .map((c) => {
          const rows = c.rows
            .map(
              (r) =>
                `<tr><td>${formatShortDate(r.date)}</td><td>${escapeHtml(r.areaName)}</td><td>${escapeHtml(r.crop)}</td><td>${escapeHtml(r.activity)}</td><td>${escapeHtml(r.input)}</td><td>${escapeHtml(r.quantity)}</td><td>${escapeHtml(r.extra)}</td></tr>`,
            )
            .join('');
          const totals = c.totals.length
            ? `<p class="totais">Somas: ${c.totals.map((t) => escapeHtml(totalText(t))).join(' · ')}</p>`
            : '';
          return `<h3>${escapeHtml(c.crop)}</h3><table><thead><tr><th>Data</th><th>Área</th><th>Cultura</th><th>Atividade</th><th>Insumo/semente e origem</th><th>Quantidade</th><th>Valor, destino ou observação</th></tr></thead><tbody>${rows}</tbody></table>${totals}`;
        })
        .join('');
      return `<h2>${escapeHtml(g.areaName)}</h2>${crops}`;
    })
    .join('');
}

export function summaryHtml(opts: { title: string; periodLabel: string; profile: Profile | null; summary: Summary }): string {
  const body = `<h1>${escapeHtml(opts.title)}</h1><p class="muted">${escapeHtml(opts.periodLabel)} · ${opts.summary.count} anotações</p>${profileLines(opts.profile)}${summaryTables(opts.summary)}`;
  return page(opts.title, body);
}

export function visitHtml(opts: {
  profile: Profile | null;
  items: CheckItem[];
  summary: Summary;
  periodLabel: string;
  generatedOn: string;
}): string {
  const list = opts.items
    .map(
      (i) =>
        `<tr><td class="${i.done ? 'ok' : 'falta'}">${i.done ? 'Pronto' : 'Falta'}</td><td><strong>${escapeHtml(i.label)}</strong>${i.auto ? '' : ' <span class="muted">(marcado pelo produtor)</span>'}<br><span class="muted">${escapeHtml(i.missing ?? i.why)}</span></td></tr>`,
    )
    .join('');
  const body = `<h1>Resumo para a visita</h1><p class="muted">Gerado em ${escapeHtml(formatLongDate(opts.generatedOn))}. Lista de apoio para organizar a visita; não substitui o roteiro do seu grupo.</p>${profileLines(opts.profile)}<h2>Lista de conferência</h2><table><tbody>${list}</tbody></table><h2>Anotações ${escapeHtml(opts.periodLabel)}</h2>${summaryTables(opts.summary)}`;
  return page('Resumo para a visita', body);
}

export function cardHtml(opts: { name: string; cooperative?: string; municipality?: string; qrSvg: string; url: string }): string {
  const body = `
  <div style="border:2px solid #2f5d34;border-radius:14px;padding:22px;max-width:420px;margin:0 auto;text-align:center">
    <h1 style="font-size:24px">${escapeHtml(opts.name)}</h1>
    ${opts.cooperative ? `<p>${escapeHtml(opts.cooperative)}</p>` : ''}
    ${opts.municipality ? `<p class="muted">${escapeHtml(opts.municipality)}</p>` : ''}
    <div style="margin:18px auto;width:260px;height:260px">${opts.qrSvg /* SVG gerado por qrSvg(), sem texto do usuário */}</div>
    <p style="font-size:16px"><strong>Aponte a câmera do celular para conhecer quem produziu</strong></p>
    <p class="muted" style="font-size:10px;word-break:break-all">${escapeHtml(opts.url)}</p>
  </div>`;
  return page(`Cartão de ${opts.name}`, body);
}

/** Cartão de recuperação: QR e código para ligar outro celular ao mesmo caderno. */
export function recoveryCardHtml(opts: { name: string; qrSvg: string; code: string }): string {
  const body = `
  <div style="border:2px solid #9a4a1e;border-radius:14px;padding:22px;max-width:440px;margin:0 auto;text-align:center">
    <h1 style="font-size:22px">Cartão de recuperação</h1>
    <p>Caderno de Bolso de <strong>${escapeHtml(opts.name)}</strong></p>
    <div style="margin:18px auto;width:240px;height:240px">${opts.qrSvg /* SVG gerado por qrSvg(), sem texto do usuário */}</div>
    <p style="font-size:14px">Se trocar de celular, instale o Caderno de Bolso, toque em <strong>Já tenho um caderno</strong> e aponte a câmera para este código.</p>
    <p style="font-size:14px"><strong>Guarde em lugar seguro.</strong> Quem tiver este cartão consegue ver e mudar o seu caderno.</p>
    <p class="muted" style="font-size:10px;word-break:break-all">${escapeHtml(opts.code)}</p>
  </div>`;
  return page('Cartão de recuperação', body);
}

const VAZIO = '________________';

/** Texto do usuário: escapado, ou a linha em branco para preencher à mão. */
function ouVazio(texto: string): string {
  return texto.trim() ? escapeHtml(texto) : VAZIO;
}

/**
 * Folha do roteiro de apoio à visita: dados da visita, uma tabela por etapa
 * (pergunta, resposta, observação), não conformidades, parecer marcado e três
 * linhas de assinatura. O que ficou sem resposta sai em branco.
 */
export function roteiroHtml(visita: Visita, generatedOn: string): string {
  const tipo = OPCOES_TIPO.find((o) => o.valor === visita.tipo)?.rotulo ?? '';
  const dados = `<table><tbody>
    <tr><th>Produtor visitado</th><td>${ouVazio(visita.produtor.nome)}</td><th>Município</th><td>${ouVazio(visita.produtor.municipio)}</td></tr>
    <tr><th>Data</th><td>${visita.data ? escapeHtml(formatLongDate(visita.data)) : VAZIO}</td><th>Tipo</th><td>${ouVazio(tipo)}</td></tr>
    <tr><th>Quem visitou</th><td colspan="3">${ouVazio(visita.visitantes)}</td></tr>
  </tbody></table>`;

  const etapas = ETAPAS.filter((e) => e.id !== 'identificacao' && e.id !== 'fechamento')
    .map((etapa) => {
      let extra = '';
      if (etapa.id === 'sementes') {
        const culturas = visita.culturasSensiveis.length ? visita.culturasSensiveis.join(', ') : 'nenhuma';
        extra = `<p>Culturas com comprovação de origem exigida: ${escapeHtml(culturas)}</p>`;
      }
      if (etapa.id === 'colheita') {
        const uso =
          visita.usoArmazenamento === 'exclusivo'
            ? 'só para orgânico'
            : visita.usoArmazenamento === 'compartilhado'
              ? `compartilhados com convencional. Separação: ${ouVazio(visita.separacao)}`
              : VAZIO;
        extra = `<p>Armazém e transporte: ${uso}</p>`;
      }
      const linhas = itensDaEtapa(visita, etapa.id)
        .map((item) => {
          const r = visita.respostas[item.id];
          return `<tr><td>${escapeHtml(item.texto)}</td><td>${r?.r ? escapeHtml(ROTULO_RESPOSTA[r.r]) : ''}</td><td class="texto">${escapeHtml(r?.obs ?? '')}</td></tr>`;
        })
        .join('');
      return `<h2>${escapeHtml(etapa.titulo)}</h2>${extra}<table><thead><tr><th style="width:50%">Pergunta</th><th style="width:15%">Resposta</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table>`;
    })
    .join('');

  const ncs = visita.naoConformidades.length
    ? `<table><thead><tr><th>O que precisa corrigir</th><th style="width:30%">Prazo</th></tr></thead><tbody>${visita.naoConformidades
        .map((nc) => `<tr><td class="texto">${escapeHtml(nc.descricao)}</td><td>${nc.prazo ? escapeHtml(formatShortDate(nc.prazo)) : ''}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p>Nenhuma anotada.</p>';

  const parecer = OPCOES_PARECER.map(
    (o) => `<p><span class="marca">${visita.parecer === o.valor ? 'X' : ''}</span>${escapeHtml(o.rotulo)}</p>`,
  ).join('');

  const body = `<h1>Roteiro de apoio à visita</h1>
    <p class="muted">Gerado em ${escapeHtml(formatLongDate(generatedOn))}. Folha de apoio para organizar a visita; não substitui o roteiro nem os documentos oficiais do grupo (OPAC).</p>
    ${dados}${etapas}
    <h2>Não conformidades</h2>${ncs}
    <h2>Pontos fortes</h2><p class="texto">${ouVazio(visita.pontosFortes)}</p>
    <h2>Observações</h2><p class="texto">${ouVazio(visita.observacoes)}</p>
    <h2>Parecer</h2>${parecer}
    <table class="assinaturas"><tbody><tr><td>Produtor visitado</td><td class="vao"></td><td>Quem visitou</td><td class="vao"></td><td>Quem visitou</td></tr></tbody></table>`;
  return page(
    'Roteiro de apoio à visita',
    body,
    'Feito com o Caderno de Bolso. Roteiro de apoio: não substitui o roteiro nem os documentos oficiais do grupo.',
  );
}
