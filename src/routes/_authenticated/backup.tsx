import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Loader2, Package } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { currency, statusOf, statusLabel } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({ meta: [{ title: "Backup — Taty Gomes Alta Estética Gestão" }] }),
  component: BackupPage,
});

// ---------- helpers ----------

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v instanceof Date) return v.toLocaleString("pt-BR");
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}
function fmtDate(v: any) { return v ? new Date(v).toLocaleDateString("pt-BR") : "—"; }
function fmtDT(v: any) { return v ? new Date(v).toLocaleString("pt-BR") : "—"; }

function pdfBase(title: string, subtitle?: string) {
  const doc = new jsPDF({ orientation: "portrait" });
  doc.setFontSize(16);
  doc.text("Taty Gomes Alta Estética", 14, 16);
  doc.setFontSize(11);
  doc.text(title, 14, 24);
  if (subtitle) { doc.setFontSize(9); doc.text(subtitle, 14, 30); }
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, subtitle ? 35 : 30);
  return doc;
}

function detailBlock(doc: jsPDF, title: string, rows: [string, any][], startY: number) {
  doc.setFontSize(12);
  doc.setTextColor(90, 40, 40);
  doc.text(title, 14, startY);
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: startY + 3,
    head: [["Campo", "Valor"]],
    body: rows.map(([k, v]) => [k, fmt(v)]),
    styles: { fontSize: 9, cellPadding: 2, valign: "top" },
    headStyles: { fillColor: [194, 156, 141] },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
    margin: { left: 14, right: 14 },
  });
  return (doc as any).lastAutoTable.finalY + 6;
}

function ensureSpace(doc: jsPDF, y: number, needed = 40) {
  const h = doc.internal.pageSize.getHeight();
  if (y + needed > h - 12) { doc.addPage(); return 16; }
  return y;
}

// ---------- module renderers ----------

type Renderer = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  // fetch list of {id, label, subLabel?}
  fetchList: () => Promise<{ id: string; label: string; sub?: string }[]>;
  // build a detailed PDF for one id or all
  buildPdf: (opts: { onlyId?: string }) => Promise<{ doc: jsPDF; filename: string }>;
  // render sections into an existing doc (used by "backup completo"); returns new Y
  renderInto: (doc: jsPDF, startY: number) => Promise<number>;
};

// ---- Produtos ----
async function prodDetails(onlyId?: string) {
  let q = supabase.from("products").select("*, categories(name), suppliers(name)").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  const { data } = await q;
  return data ?? [];
}
function prodRows(p: any): [string, any][] {
  return [
    ["Nome", p.name],
    ["Código interno", p.internal_code],
    ["Categoria", p.categories?.name],
    ["Fornecedor", p.suppliers?.name],
    ["Lote", p.batch],
    ["Validade", fmtDate(p.expiry_date)],
    ["Quantidade", p.quantity],
    ["Unidade", p.unit],
    ["Estoque mínimo", p.min_stock],
    ["Custo", currency(Number(p.cost_value))],
    ["Status", statusLabel[statusOf(p.quantity, p.min_stock, p.expiry_date)]],
    ["Observações", p.notes],
    ["Criado em", fmtDT(p.created_at)],
    ["Atualizado em", fmtDT(p.updated_at)],
    ["ID", p.id],
  ];
}

// ---- Clientes ----
async function cliDetails(onlyId?: string) {
  let q = supabase.from("clientes").select("*").order("nome");
  if (onlyId) q = q.eq("id", onlyId);
  const { data: clientes } = await q;
  const ids = (clientes ?? []).map((c: any) => c.id);
  let anamneses: any[] = [];
  let appts: any[] = [];
  if (ids.length) {
    const [{ data: a }, { data: ap }] = await Promise.all([
      supabase.from("anamneses").select("*").in("cliente_id", ids).order("data_atendimento", { ascending: false }),
      supabase.from("appointments").select("*, services(name), professionals(name)").in("client_id", ids).order("starts_at", { ascending: false }),
    ]);
    anamneses = a ?? [];
    appts = ap ?? [];
  }
  return (clientes ?? []).map((c: any) => ({
    ...c,
    _anamneses: anamneses.filter((a) => a.cliente_id === c.id),
    _appts: appts.filter((a) => a.client_id === c.id),
  }));
}
function cliRows(c: any): [string, any][] {
  return [
    ["Nome", c.nome], ["CPF", c.cpf], ["RG", c.rg],
    ["Data de nascimento", fmtDate(c.data_nascimento)],
    ["Telefone", c.telefone], ["E-mail", c.email],
    ["Endereço", c.endereco], ["Cidade", c.cidade], ["Estado", c.estado],
    ["Profissão", c.profissao], ["Observações", c.observacoes],
    ["Cadastrado em", fmtDT(c.created_at)], ["Atualizado em", fmtDT(c.updated_at)],
    ["ID", c.id],
  ];
}
function anamneseRows(a: any): [string, any][] {
  const imc = a.peso && a.altura ? (Number(a.peso) / (Number(a.altura) * Number(a.altura))).toFixed(2) : "—";
  return [
    ["Data do atendimento", fmtDate(a.data_atendimento)],
    ["Peso (kg)", a.peso], ["Altura (m)", a.altura], ["IMC", imc], ["Medidas", a.medidas],
    ["Queixa principal", a.queixa_principal],
    ["Histórico de saúde", a.historico_saude],
    ["Alergias", a.alergias], ["Medicamentos", a.medicamentos],
    ["Cirurgias prévias", a.cirurgias_previas],
    ["Gestante", a.gestante], ["Fumante", a.fumante],
    ["Hipertensão", a.hipertensao], ["Diabetes", a.diabetes],
    ["Procedimentos estéticos prévios", a.procedimentos_esteticos_previos],
    ["Contraindicações", a.contraindicacoes],
    ["Procedimento realizado", a.procedimento_realizado],
    ["Produtos utilizados", a.produtos_utilizados],
    ["Observações", a.observacoes],
    ["Registrado em", fmtDT(a.created_at)],
  ];
}

// ---- Fornecedores ----
async function fornDetails(onlyId?: string) {
  let q = supabase.from("suppliers").select("*").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  return (await q).data ?? [];
}
function fornRows(s: any): [string, any][] {
  return [
    ["Nome", s.name], ["CNPJ", s.cnpj], ["Contato", s.contact_name],
    ["Telefone", s.phone], ["E-mail", s.email],
    ["Observações", s.notes],
    ["Criado em", fmtDT(s.created_at)], ["Atualizado em", fmtDT(s.updated_at)],
    ["ID", s.id],
  ];
}

// ---- Movimentações ----
async function movDetails(onlyId?: string) {
  let q = supabase.from("movements").select("*, products(name, unit)").order("created_at", { ascending: false });
  if (onlyId) q = q.eq("id", onlyId);
  return (await q).data ?? [];
}
function movRows(m: any): [string, any][] {
  return [
    ["Data", fmtDT(m.created_at)],
    ["Produto", m.products?.name],
    ["Tipo", m.type === "in" ? "Entrada" : "Saída"],
    ["Quantidade", `${m.quantity} ${m.products?.unit ?? ""}`],
    ["Motivo", m.reason],
    ["Usuário (ID)", m.user_id],
    ["ID movimentação", m.id],
  ];
}

// ---- Serviços ----
async function servDetails(onlyId?: string) {
  let q = supabase.from("services").select("*, service_categories(name), professionals(name)").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  const { data: services } = await q;
  const ids = (services ?? []).map((s: any) => s.id);
  let insumos: any[] = [];
  if (ids.length) {
    const { data } = await supabase.from("service_products").select("*, products(name, unit)").in("service_id", ids);
    insumos = data ?? [];
  }
  return (services ?? []).map((s: any) => ({ ...s, _insumos: insumos.filter((i) => i.service_id === s.id) }));
}
function servRows(s: any): [string, any][] {
  return [
    ["Nome", s.name], ["Categoria", s.service_categories?.name],
    ["Profissional", s.professionals?.name],
    ["Duração (min)", s.duration_minutes],
    ["Preço", currency(Number(s.price))],
    ["Ativo", s.active],
    ["Descrição", s.description], ["Observações", s.notes],
    ["Criado em", fmtDT(s.created_at)], ["Atualizado em", fmtDT(s.updated_at)],
    ["ID", s.id],
  ];
}

// ---- Profissionais ----
async function profDetails(onlyId?: string) {
  let q = supabase.from("professionals").select("*").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  return (await q).data ?? [];
}
function profRows(p: any): [string, any][] {
  return [
    ["Nome", p.name], ["Especialidade", p.specialty],
    ["Telefone", p.phone], ["E-mail", p.email],
    ["Ativo", p.active], ["Observações", p.notes],
    ["Google conectado", !!p.google_refresh_token],
    ["Google e-mail", p.google_email],
    ["Google calendar ID", p.google_calendar_id],
    ["Conectado em", fmtDT(p.google_connected_at)],
    ["Criado em", fmtDT(p.created_at)], ["Atualizado em", fmtDT(p.updated_at)],
    ["ID", p.id],
  ];
}

// ---- Agendamentos ----
async function apptDetails(onlyId?: string) {
  let q = supabase.from("appointments").select("*, services(name), professionals(name), clientes(nome)").order("starts_at", { ascending: false });
  if (onlyId) q = q.eq("id", onlyId);
  return (await q).data ?? [];
}
function apptRows(a: any): [string, any][] {
  return [
    ["Início", fmtDT(a.starts_at)], ["Fim", fmtDT(a.ends_at)],
    ["Cliente", a.clientes?.nome ?? a.client_name],
    ["Serviço", a.services?.name],
    ["Profissional", a.professionals?.name],
    ["Status", a.status],
    ["Preço", currency(Number(a.price ?? 0))],
    ["Observações", a.notes],
    ["Google event ID", a.google_event_id],
    ["Google calendar ID", a.google_calendar_id],
    ["Erro de sincronização", a.google_sync_error],
    ["Criado em", fmtDT(a.created_at)], ["Atualizado em", fmtDT(a.updated_at)],
    ["ID", a.id],
  ];
}

// ---- Categorias produtos ----
async function catDetails(onlyId?: string) {
  let q = supabase.from("categories").select("*").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  const { data } = await q;
  const ids = (data ?? []).map((c: any) => c.id);
  let prods: any[] = [];
  if (ids.length) {
    const { data: p } = await supabase.from("products").select("id, name, quantity, unit, category_id").in("category_id", ids).order("name");
    prods = p ?? [];
  }
  return (data ?? []).map((c: any) => ({ ...c, _products: prods.filter((p) => p.category_id === c.id) }));
}

// ---- Categorias serviços ----
async function servCatDetails(onlyId?: string) {
  let q = supabase.from("service_categories").select("*").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  const { data } = await q;
  const ids = (data ?? []).map((c: any) => c.id);
  let svcs: any[] = [];
  if (ids.length) {
    const { data: s } = await supabase.from("services").select("id, name, price, category_id").in("category_id", ids).order("name");
    svcs = s ?? [];
  }
  return (data ?? []).map((c: any) => ({ ...c, _services: svcs.filter((s) => s.category_id === c.id) }));
}

// ---- Usuários ----
async function userDetails(onlyId?: string) {
  let q = supabase.from("profiles").select("*").order("full_name");
  if (onlyId) q = q.eq("id", onlyId);
  const { data: profiles } = await q;
  const { data: roles } = await supabase.from("user_roles").select("*");
  return (profiles ?? []).map((p: any) => ({
    ...p,
    _roles: (roles ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
  }));
}
function userRows(u: any): [string, any][] {
  return [
    ["Nome", u.full_name], ["E-mail", u.email],
    ["Papéis", (u._roles ?? []).join(", ") || "user"],
    ["Cadastrado em", fmtDT(u.created_at)],
    ["ID", u.id],
  ];
}

// ---- Auditoria ----
async function auditDetails(onlyId?: string) {
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(5000);
  if (onlyId) q = q.eq("id", onlyId);
  return (await q).data ?? [];
}
function auditRows(l: any): [string, any][] {
  return [
    ["Data", fmtDT(l.created_at)],
    ["Usuário (ID)", l.user_id],
    ["Ação", l.action],
    ["Entidade", l.entity],
    ["ID entidade", l.entity_id],
    ["Detalhes", l.details],
    ["ID log", l.id],
  ];
}

// ---------- registry ----------

const registry: Renderer[] = [
  {
    key: "produtos", label: "Produtos",
    fetchList: async () => (await prodDetails()).map((p: any) => ({ id: p.id, label: p.name, sub: `${p.quantity} ${p.unit ?? ""}` })),
    buildPdf: async ({ onlyId }) => {
      const items = await prodDetails(onlyId);
      const doc = pdfBase(onlyId ? `Produto: ${items[0]?.name ?? ""}` : `Produtos (${items.length})`);
      let y = 40;
      for (const p of items) {
        y = ensureSpace(doc, y, 60);
        y = detailBlock(doc, p.name, prodRows(p), y);
      }
      return { doc, filename: onlyId ? `produto-${items[0]?.name ?? "item"}` : "produtos-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await prodDetails();
      let y = startY;
      for (const p of items) { y = ensureSpace(doc, y, 60); y = detailBlock(doc, `Produto — ${p.name}`, prodRows(p), y); }
      return y;
    },
  },
  {
    key: "categorias", label: "Categorias de produto",
    fetchList: async () => (await catDetails()).map((c: any) => ({ id: c.id, label: c.name, sub: `${c._products.length} produto(s)` })),
    buildPdf: async ({ onlyId }) => {
      const items = await catDetails(onlyId);
      const doc = pdfBase(onlyId ? `Categoria: ${items[0]?.name ?? ""}` : `Categorias de produto (${items.length})`);
      let y = 40;
      for (const c of items) {
        y = ensureSpace(doc, y, 40);
        y = detailBlock(doc, c.name, [["Nome", c.name], ["Criada em", fmtDT(c.created_at)], ["Produtos", c._products.length], ["ID", c.id]], y);
        if (c._products.length) {
          y = ensureSpace(doc, y, 30);
          autoTable(doc, {
            startY: y,
            head: [["Produto", "Qtde", "Un"]],
            body: c._products.map((p: any) => [p.name, p.quantity, p.unit ?? ""]),
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [194, 156, 141] },
            margin: { left: 14, right: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }
      }
      return { doc, filename: onlyId ? `categoria-${items[0]?.name}` : "categorias-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await catDetails();
      let y = startY;
      for (const c of items) {
        y = ensureSpace(doc, y, 40);
        y = detailBlock(doc, `Categoria — ${c.name}`, [["Produtos", c._products.length], ["Criada em", fmtDT(c.created_at)]], y);
      }
      return y;
    },
  },
  {
    key: "fornecedores", label: "Fornecedores",
    fetchList: async () => (await fornDetails()).map((s: any) => ({ id: s.id, label: s.name, sub: s.cnpj ?? "" })),
    buildPdf: async ({ onlyId }) => {
      const items = await fornDetails(onlyId);
      const doc = pdfBase(onlyId ? `Fornecedor: ${items[0]?.name ?? ""}` : `Fornecedores (${items.length})`);
      let y = 40;
      for (const s of items) { y = ensureSpace(doc, y, 60); y = detailBlock(doc, s.name, fornRows(s), y); }
      return { doc, filename: onlyId ? `fornecedor-${items[0]?.name}` : "fornecedores-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await fornDetails();
      let y = startY;
      for (const s of items) { y = ensureSpace(doc, y, 60); y = detailBlock(doc, `Fornecedor — ${s.name}`, fornRows(s), y); }
      return y;
    },
  },
  {
    key: "movimentacoes", label: "Movimentações de estoque",
    fetchList: async () => (await movDetails()).map((m: any) => ({
      id: m.id,
      label: `${new Date(m.created_at).toLocaleString("pt-BR")} · ${m.products?.name ?? "?"}`,
      sub: `${m.type === "in" ? "Entrada" : "Saída"} · ${m.quantity}`,
    })),
    buildPdf: async ({ onlyId }) => {
      const items = await movDetails(onlyId);
      const doc = pdfBase(onlyId ? `Movimentação` : `Movimentações (${items.length})`);
      let y = 40;
      for (const m of items) { y = ensureSpace(doc, y, 50); y = detailBlock(doc, `${m.products?.name ?? "?"} — ${m.type === "in" ? "Entrada" : "Saída"}`, movRows(m), y); }
      return { doc, filename: onlyId ? `movimentacao-${items[0]?.id?.slice(0, 8)}` : "movimentacoes-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await movDetails();
      let y = startY;
      for (const m of items) { y = ensureSpace(doc, y, 50); y = detailBlock(doc, `Movimentação — ${m.products?.name ?? "?"}`, movRows(m), y); }
      return y;
    },
  },
  {
    key: "clientes", label: "Clientes",
    fetchList: async () => (await cliDetails()).map((c: any) => ({ id: c.id, label: c.nome, sub: c.telefone ?? c.email ?? "" })),
    buildPdf: async ({ onlyId }) => {
      const items = await cliDetails(onlyId);
      const doc = pdfBase(onlyId ? `Cliente: ${items[0]?.nome ?? ""}` : `Clientes (${items.length})`, "Inclui dados cadastrais, anamneses e agendamentos");
      let y = 42;
      for (const c of items) {
        y = ensureSpace(doc, y, 60);
        y = detailBlock(doc, `Cliente — ${c.nome}`, cliRows(c), y);
        if (c._anamneses.length) {
          for (const a of c._anamneses) {
            y = ensureSpace(doc, y, 80);
            y = detailBlock(doc, `Anamnese ${fmtDate(a.data_atendimento)}`, anamneseRows(a), y);
          }
        } else {
          y = ensureSpace(doc, y, 12);
          doc.setFontSize(9); doc.text("Sem anamneses registradas.", 14, y); y += 6;
        }
        if (c._appts.length) {
          y = ensureSpace(doc, y, 30);
          doc.setFontSize(11); doc.text("Agendamentos", 14, y); y += 3;
          autoTable(doc, {
            startY: y,
            head: [["Início", "Serviço", "Profissional", "Status", "Preço"]],
            body: c._appts.map((a: any) => [
              fmtDT(a.starts_at), a.services?.name ?? "—", a.professionals?.name ?? "—",
              a.status ?? "—", currency(Number(a.price ?? 0)),
            ]),
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [194, 156, 141] },
            margin: { left: 14, right: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }
        if (onlyId) break;
        doc.addPage(); y = 16;
      }
      return { doc, filename: onlyId ? `cliente-${items[0]?.nome}` : "clientes-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await cliDetails();
      let y = startY;
      for (const c of items) {
        y = ensureSpace(doc, y, 60);
        y = detailBlock(doc, `Cliente — ${c.nome}`, cliRows(c), y);
        for (const a of c._anamneses) { y = ensureSpace(doc, y, 80); y = detailBlock(doc, `  Anamnese ${fmtDate(a.data_atendimento)}`, anamneseRows(a), y); }
      }
      return y;
    },
  },
  {
    key: "anamneses", label: "Fichas de anamnese",
    fetchList: async () => {
      const { data } = await supabase.from("anamneses").select("id, data_atendimento, clientes(nome)").order("data_atendimento", { ascending: false });
      return (data ?? []).map((a: any) => ({ id: a.id, label: `${a.clientes?.nome ?? "?"}`, sub: fmtDate(a.data_atendimento) }));
    },
    buildPdf: async ({ onlyId }) => {
      let q = supabase.from("anamneses").select("*, clientes(nome)").order("data_atendimento", { ascending: false });
      if (onlyId) q = q.eq("id", onlyId);
      const items = (await q).data ?? [];
      const doc = pdfBase(onlyId ? `Anamnese — ${items[0]?.clientes?.nome ?? ""}` : `Fichas de anamnese (${items.length})`);
      let y = 40;
      for (const a of items) {
        y = ensureSpace(doc, y, 80);
        y = detailBlock(doc, `${a.clientes?.nome ?? "?"} — ${fmtDate(a.data_atendimento)}`, anamneseRows(a), y);
      }
      return { doc, filename: onlyId ? `anamnese-${items[0]?.id?.slice(0, 8)}` : "anamneses-completo" };
    },
    renderInto: async (doc, startY) => {
      const { data } = await supabase.from("anamneses").select("*, clientes(nome)").order("data_atendimento", { ascending: false });
      let y = startY;
      for (const a of data ?? []) { y = ensureSpace(doc, y, 80); y = detailBlock(doc, `Anamnese — ${a.clientes?.nome ?? "?"}`, anamneseRows(a), y); }
      return y;
    },
  },
  {
    key: "servicos", label: "Serviços",
    fetchList: async () => (await servDetails()).map((s: any) => ({ id: s.id, label: s.name, sub: currency(Number(s.price)) })),
    buildPdf: async ({ onlyId }) => {
      const items = await servDetails(onlyId);
      const doc = pdfBase(onlyId ? `Serviço: ${items[0]?.name ?? ""}` : `Serviços (${items.length})`);
      let y = 40;
      for (const s of items) {
        y = ensureSpace(doc, y, 60);
        y = detailBlock(doc, s.name, servRows(s), y);
        if (s._insumos.length) {
          y = ensureSpace(doc, y, 30);
          doc.setFontSize(10); doc.text("Insumos utilizados", 14, y); y += 3;
          autoTable(doc, {
            startY: y,
            head: [["Produto", "Qtde", "Un"]],
            body: s._insumos.map((i: any) => [i.products?.name ?? "—", i.quantity, i.products?.unit ?? ""]),
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [194, 156, 141] },
            margin: { left: 14, right: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }
      }
      return { doc, filename: onlyId ? `servico-${items[0]?.name}` : "servicos-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await servDetails();
      let y = startY;
      for (const s of items) { y = ensureSpace(doc, y, 60); y = detailBlock(doc, `Serviço — ${s.name}`, servRows(s), y); }
      return y;
    },
  },
  {
    key: "servicos-categorias", label: "Categorias de serviço",
    fetchList: async () => (await servCatDetails()).map((c: any) => ({ id: c.id, label: c.name, sub: `${c._services.length} serviço(s)` })),
    buildPdf: async ({ onlyId }) => {
      const items = await servCatDetails(onlyId);
      const doc = pdfBase(onlyId ? `Categoria de serviço: ${items[0]?.name}` : `Categorias de serviço (${items.length})`);
      let y = 40;
      for (const c of items) {
        y = ensureSpace(doc, y, 40);
        y = detailBlock(doc, c.name, [["Nome", c.name], ["Criada em", fmtDT(c.created_at)], ["Serviços", c._services.length], ["ID", c.id]], y);
        if (c._services.length) {
          autoTable(doc, {
            startY: y, head: [["Serviço", "Preço"]],
            body: c._services.map((s: any) => [s.name, currency(Number(s.price))]),
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [194, 156, 141] },
            margin: { left: 14, right: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }
      }
      return { doc, filename: onlyId ? `categoria-servico-${items[0]?.name}` : "categorias-servico-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await servCatDetails();
      let y = startY;
      for (const c of items) { y = ensureSpace(doc, y, 30); y = detailBlock(doc, `Categoria serviço — ${c.name}`, [["Serviços", c._services.length]], y); }
      return y;
    },
  },
  {
    key: "profissionais", label: "Profissionais",
    fetchList: async () => (await profDetails()).map((p: any) => ({ id: p.id, label: p.name, sub: p.specialty ?? "" })),
    buildPdf: async ({ onlyId }) => {
      const items = await profDetails(onlyId);
      const doc = pdfBase(onlyId ? `Profissional: ${items[0]?.name}` : `Profissionais (${items.length})`);
      let y = 40;
      for (const p of items) { y = ensureSpace(doc, y, 60); y = detailBlock(doc, p.name, profRows(p), y); }
      return { doc, filename: onlyId ? `profissional-${items[0]?.name}` : "profissionais-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await profDetails();
      let y = startY;
      for (const p of items) { y = ensureSpace(doc, y, 60); y = detailBlock(doc, `Profissional — ${p.name}`, profRows(p), y); }
      return y;
    },
  },
  {
    key: "agenda", label: "Agenda / agendamentos",
    fetchList: async () => (await apptDetails()).map((a: any) => ({
      id: a.id,
      label: `${fmtDT(a.starts_at)} — ${a.clientes?.nome ?? a.client_name ?? "?"}`,
      sub: a.services?.name ?? "",
    })),
    buildPdf: async ({ onlyId }) => {
      const items = await apptDetails(onlyId);
      const doc = pdfBase(onlyId ? `Agendamento` : `Agendamentos (${items.length})`);
      let y = 40;
      for (const a of items) { y = ensureSpace(doc, y, 70); y = detailBlock(doc, `${a.clientes?.nome ?? a.client_name ?? "?"} — ${a.services?.name ?? ""}`, apptRows(a), y); }
      return { doc, filename: onlyId ? `agendamento-${items[0]?.id?.slice(0, 8)}` : "agendamentos-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await apptDetails();
      let y = startY;
      for (const a of items) { y = ensureSpace(doc, y, 70); y = detailBlock(doc, `Agendamento — ${fmtDT(a.starts_at)}`, apptRows(a), y); }
      return y;
    },
  },
  {
    key: "usuarios", label: "Usuários do sistema",
    fetchList: async () => (await userDetails()).map((u: any) => ({ id: u.id, label: u.full_name ?? u.email ?? u.id, sub: u.email ?? "" })),
    buildPdf: async ({ onlyId }) => {
      const items = await userDetails(onlyId);
      const doc = pdfBase(onlyId ? `Usuário: ${items[0]?.full_name}` : `Usuários (${items.length})`);
      let y = 40;
      for (const u of items) { y = ensureSpace(doc, y, 40); y = detailBlock(doc, u.full_name ?? u.email, userRows(u), y); }
      return { doc, filename: onlyId ? `usuario-${items[0]?.full_name}` : "usuarios-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await userDetails();
      let y = startY;
      for (const u of items) { y = ensureSpace(doc, y, 40); y = detailBlock(doc, `Usuário — ${u.full_name ?? u.email}`, userRows(u), y); }
      return y;
    },
  },
  {
    key: "auditoria", label: "Auditoria",
    fetchList: async () => {
      const { data } = await supabase.from("audit_log").select("id, created_at, action, entity").order("created_at", { ascending: false }).limit(500);
      return (data ?? []).map((l: any) => ({ id: l.id, label: `${l.action} · ${l.entity}`, sub: fmtDT(l.created_at) }));
    },
    buildPdf: async ({ onlyId }) => {
      const items = await auditDetails(onlyId);
      const doc = pdfBase(onlyId ? `Evento de auditoria` : `Auditoria (${items.length})`);
      let y = 40;
      for (const l of items) { y = ensureSpace(doc, y, 50); y = detailBlock(doc, `${l.action} · ${l.entity}`, auditRows(l), y); }
      return { doc, filename: onlyId ? `auditoria-${items[0]?.id?.slice(0, 8)}` : "auditoria-completo" };
    },
    renderInto: async (doc, startY) => {
      const items = await auditDetails();
      let y = startY;
      for (const l of items) { y = ensureSpace(doc, y, 50); y = detailBlock(doc, `Auditoria — ${l.action}`, auditRows(l), y); }
      return y;
    },
  },
];

// ---------- component ----------

function BackupPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({}); // key -> "ALL" | id
  const [search, setSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const admin = !!roles?.some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) { toast.error("Acesso restrito a administradores."); router.navigate({ to: "/dashboard" }); }
    });
  }, [router]);

  async function download(key: string, run: () => Promise<{ doc: jsPDF; filename: string }>) {
    try {
      setLoading(key);
      const { doc, filename } = await run();
      doc.save(`${filename.replace(/[^\w\-]+/g, "_")}-${Date.now()}.pdf`);
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar PDF");
    } finally {
      setLoading(null);
    }
  }

  async function backupCompleto() {
    const doc = pdfBase("Backup completo do sistema", "Todas as informações detalhadas de cada módulo");
    for (const r of registry) {
      doc.addPage();
      doc.setFontSize(18); doc.setTextColor(90, 40, 40);
      doc.text(r.label, 14, 20);
      doc.setTextColor(0, 0, 0);
      await r.renderInto(doc, 30);
    }
    return { doc, filename: "backup-completo" };
  }

  if (isAdmin === null) return <div className="flex items-center justify-center py-20 text-text-muted"><Loader2 className="size-5 animate-spin mr-2" /> Verificando permissões…</div>;
  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Administração</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Backup em PDF</h1>
          <p className="text-sm text-text-muted mt-1">Baixe todas as informações de qualquer módulo, ou apenas de um registro específico.</p>
        </div>
        <Button onClick={() => download("__all__", backupCompleto)} disabled={loading !== null} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          {loading === "__all__" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Package className="size-4 mr-1.5" />}
          Backup completo (tudo detalhado)
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {registry.map((r) => <ModuleCard key={r.key} r={r} loading={loading} onDownload={download} selection={selection} setSelection={setSelection} search={search} setSearch={setSearch} />)}
      </div>
    </div>
  );
}

function ModuleCard({ r, loading, onDownload, selection, setSelection, search, setSearch }: {
  r: Renderer; loading: string | null;
  onDownload: (key: string, run: () => Promise<{ doc: jsPDF; filename: string }>) => Promise<void>;
  selection: Record<string, string>; setSelection: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  search: Record<string, string>; setSearch: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const list = useQuery({
    queryKey: ["backup-list", r.key],
    queryFn: r.fetchList,
  });
  const term = (search[r.key] ?? "").toLowerCase();
  const items = useMemo(() => (list.data ?? []).filter((i) => !term || i.label.toLowerCase().includes(term) || (i.sub ?? "").toLowerCase().includes(term)), [list.data, term]);
  const sel = selection[r.key] ?? "ALL";

  const busy = loading === r.key;

  return (
    <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-brand-primary shrink-0" />
          <h2 className="text-sm font-semibold truncate">{r.label}</h2>
        </div>
        <span className="text-[11px] text-text-muted">{list.data?.length ?? "…"} registro(s)</span>
      </div>

      <Input
        placeholder="Buscar…"
        value={search[r.key] ?? ""}
        onChange={(e) => setSearch((p) => ({ ...p, [r.key]: e.target.value }))}
        className="h-8 text-sm"
      />

      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={sel}
        onChange={(e) => setSelection((p) => ({ ...p, [r.key]: e.target.value }))}
      >
        <option value="ALL">— Todos os registros —</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.label}{i.sub ? ` · ${i.sub}` : ""}</option>
        ))}
      </select>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || list.isLoading}
          onClick={() => onDownload(r.key, () => r.buildPdf({ onlyId: sel !== "ALL" ? sel : undefined }))}
          className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white"
        >
          {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Download className="size-3.5 mr-1.5" />}
          {sel === "ALL" ? "Baixar todos (detalhado)" : "Baixar selecionado"}
        </Button>
      </div>
    </Card>
  );
}
