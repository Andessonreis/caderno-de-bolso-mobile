// Gera o HTML dos PDFs (resumo, cartão da ficha e resumo para a visita).
// Funções puras: recebem dados prontos e devolvem uma string.

import type { CheckItem } from './checklist';
import { formatLongDate, formatShortDate } from './dates';
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
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head><body>${body}<footer>Feito com o Caderno de Bolso. Este resumo ajuda a passar a limpo; o caderno de campo continua sendo o registro oficial.</footer></body></html>`;
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
