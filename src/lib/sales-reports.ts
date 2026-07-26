import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { currency } from "@/lib/stock";

const BRAND: [number, number, number] = [194, 156, 141];
const CLINIC = "Taty Gomes Alta Estética";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX", debito: "Cartão Débito", credito: "Cartão Crédito", dinheiro: "Dinheiro",
};

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFontSize(14);
  doc.text(`${title} — ${CLINIC}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitle ? `${subtitle} · emitido em ${new Date().toLocaleString("pt-BR")}` : new Date().toLocaleString("pt-BR"), 14, 22);
  doc.setTextColor(0);
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");
const period = (from: string, to: string) => `Período ${fmtDate(from)} a ${fmtDate(to)}`;

/** Relatório de vendas do período: totais, por forma de pagamento, por profissional, ranking de itens. */
export function salesPeriodPdf(sales: any[], from: string, to: string) {
  const doc = new jsPDF();
  header(doc, "Relatório de Vendas", period(from, to));

  const sum = sales.reduce((s, v) => s + Number(v.total), 0);
  const byMethod: Record<string, { count: number; total: number }> = {};
  const byProf: Record<string, { count: number; total: number }> = {};
  const byItem: Record<string, { qty: number; total: number }> = {};

  for (const s of sales) {
    const m = s.payment_method ?? "—";
    byMethod[m] ??= { count: 0, total: 0 };
    byMethod[m].count += 1; byMethod[m].total += Number(s.total);

    const p = s.professional?.name ?? "Sem profissional";
    byProf[p] ??= { count: 0, total: 0 };
    byProf[p].count += 1; byProf[p].total += Number(s.total);

    for (const it of s.sale_items ?? []) {
      byItem[it.service_name] ??= { qty: 0, total: 0 };
      byItem[it.service_name].qty += Number(it.quantity);
      byItem[it.service_name].total += Number(it.subtotal);
    }
  }

  autoTable(doc, {
    startY: 28,
    head: [["Resumo", "Valor"]],
    body: [
      ["Vendas no período", String(sales.length)],
      ["Faturamento total", currency(sum)],
      ["Ticket médio", currency(sales.length ? sum / sales.length : 0)],
    ],
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Forma de pagamento", "Vendas", "Total"]],
    body: Object.entries(byMethod).map(([k, v]) => [PAYMENT_LABELS[k] ?? k, String(v.count), currency(v.total)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Profissional", "Vendas", "Total"]],
    body: Object.entries(byProf).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.count), currency(v.total)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Serviço / produto", "Qtde", "Total"]],
    body: Object.entries(byItem).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.qty), currency(v.total)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Data", "Cliente", "Profissional", "Pagamento", "Desc.", "Total"]],
    body: sales.map((s) => [
      new Date(s.sold_at).toLocaleString("pt-BR"),
      s.cliente?.nome ?? "Balcão",
      s.professional?.name ?? "—",
      PAYMENT_LABELS[s.payment_method] ?? s.payment_method,
      currency(Number(s.discount ?? 0)),
      currency(Number(s.total)),
    ]),
    styles: { fontSize: 8 }, headStyles: { fillColor: BRAND },
  });

  doc.save(`vendas-${from}-a-${to}.pdf`);
}

/** Comprovante de fechamento de caixa. */
export function cashSessionPdf(session: any, summary: any, sales: any[], movements: any[]) {
  const doc = new jsPDF();
  header(doc, "Fechamento de Caixa", `Aberto em ${new Date(session.opened_at).toLocaleString("pt-BR")}`);

  autoTable(doc, {
    startY: 28,
    head: [["Conferência", "Valor"]],
    body: [
      ["Valor de abertura", currency(Number(session.opening_amount))],
      ["Vendas em dinheiro", currency(summary.byMethod.dinheiro ?? 0)],
      ["Suprimentos", currency(summary.suprimentos)],
      ["Sangrias", `-${currency(summary.sangrias)}`],
      ["Dinheiro esperado", currency(Number(session.expected_amount ?? summary.expected))],
      ["Dinheiro conferido", currency(Number(session.counted_amount ?? 0))],
      ["Diferença", currency(Number(session.difference ?? 0))],
      ["Total de vendas do turno", currency(summary.sum)],
    ],
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Forma de pagamento", "Total"]],
    body: Object.entries(summary.byMethod).map(([k, v]) => [PAYMENT_LABELS[k] ?? k, currency(Number(v))]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  if (movements.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Hora", "Tipo", "Motivo", "Valor"]],
      body: movements.map((m) => [
        new Date(m.created_at).toLocaleTimeString("pt-BR"),
        m.type === "out" ? "Sangria" : "Suprimento",
        m.reason ?? "—",
        currency(Number(m.amount)),
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: BRAND },
    });
  }

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Hora", "Cliente", "Pagamento", "Total"]],
    body: sales.map((s) => [
      new Date(s.sold_at).toLocaleTimeString("pt-BR"),
      s.cliente?.nome ?? "Balcão",
      PAYMENT_LABELS[s.payment_method] ?? s.payment_method,
      currency(Number(s.total)),
    ]),
    styles: { fontSize: 8 }, headStyles: { fillColor: BRAND },
  });

  const y = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(9);
  doc.text("_______________________________", 14, y);
  doc.text("Responsável pelo caixa", 14, y + 5);

  doc.save(`fechamento-caixa-${new Date(session.opened_at).toISOString().slice(0, 10)}.pdf`);
}

/** Relatório de comissões por profissional. */
export function commissionsPdf(rows: any[], from: string, to: string) {
  const doc = new jsPDF();
  header(doc, "Relatório de Comissões", period(from, to));

  const byProf: Record<string, number> = {};
  for (const c of rows) {
    const n = c.professional?.name ?? "—";
    byProf[n] = (byProf[n] ?? 0) + Number(c.commission_amount);
  }

  autoTable(doc, {
    startY: 28,
    head: [["Profissional", "Comissão total"]],
    body: Object.entries(byProf).map(([k, v]) => [k, currency(v)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Data", "Profissional", "Serviço", "Base", "%", "Comissão", "Pago"]],
    body: rows.map((c) => [
      fmtDate(c.reference_date),
      c.professional?.name ?? "—",
      c.service?.name ?? "—",
      currency(Number(c.service_amount)),
      `${Number(c.commission_percent)}%`,
      currency(Number(c.commission_amount)),
      c.paid ? "Sim" : "Não",
    ]),
    styles: { fontSize: 8 }, headStyles: { fillColor: BRAND },
  });

  doc.save(`comissoes-${from}-a-${to}.pdf`);
}

/** DRE simplificado: entradas e saídas do financeiro. */
export function dreePdf(accounts: any[], from: string, to: string) {
  const doc = new jsPDF();
  header(doc, "Resultado Financeiro (DRE simplificado)", period(from, to));

  const receitas = accounts.filter((a) => a.type === "receita");
  const despesas = accounts.filter((a) => a.type === "despesa");
  const sumOf = (l: any[]) => l.reduce((s, a) => s + Number(a.amount), 0);
  const recTotal = sumOf(receitas);
  const despTotal = sumOf(despesas);

  autoTable(doc, {
    startY: 28,
    head: [["Resultado", "Valor"]],
    body: [
      ["Total de entradas", currency(recTotal)],
      ["Total de saídas", currency(despTotal)],
      ["Resultado do período", currency(recTotal - despTotal)],
    ],
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Data", "Tipo", "Descrição", "Situação", "Valor"]],
    body: accounts.map((a) => [
      a.due_date ? fmtDate(a.due_date) : "—",
      a.type === "receita" ? "Entrada" : "Saída",
      a.description,
      a.status === "pago" ? "Pago" : "Aberto",
      currency(Number(a.amount)),
    ]),
    styles: { fontSize: 8 }, headStyles: { fillColor: BRAND },
  });

  doc.save(`resultado-financeiro-${from}-a-${to}.pdf`);
}
