import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { currency, statusOf, statusLabel } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({ meta: [{ title: "Backup — Taty Gomes Alta Estética Gestão" }] }),
  component: BackupPage,
});

function BackupPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const admin = !!roles?.some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (!admin) {
        toast.error("Acesso restrito a administradores.");
        router.navigate({ to: "/dashboard" });
      }
    });
  }, [router]);

  const counts = useQuery({
    enabled: isAdmin === true,
    queryKey: ["backup-counts"],
    queryFn: async () => {
      const tables = ["products", "categories", "suppliers", "movements", "clientes", "anamneses", "services", "service_categories", "professionals", "appointments", "profiles", "audit_log"] as const;
      const out: Record<string, number> = {};
      await Promise.all(tables.map(async (t) => {
        const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
        out[t] = count ?? 0;
      }));
      return out;
    },
  });

  function header(doc: jsPDF, title: string) {
    doc.setFontSize(14);
    doc.text(`Taty Gomes Alta Estética — ${title}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  }

  function fmt(v: any) {
    if (v === null || v === undefined) return "-";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (typeof v === "object") return JSON.stringify(v);
    const s = String(v);
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }

  function tableFor(doc: jsPDF, cols: string[], rows: any[][]) {
    autoTable(doc, {
      startY: 28,
      head: [cols],
      body: rows,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [194, 156, 141] },
      didDrawPage: () => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.text(`Página ${pageCount}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 8);
      },
    });
  }

  async function download(key: string, fn: () => Promise<jsPDF | null>) {
    try {
      setLoading(key);
      const doc = await fn();
      if (!doc) return;
      doc.save(`${key}-${Date.now()}.pdf`);
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar PDF");
    } finally {
      setLoading(null);
    }
  }

  async function pdfProdutos() {
    const { data } = await supabase.from("products").select("*, categories(name), suppliers(name)").order("name");
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Produtos");
    tableFor(doc,
      ["Nome", "Código", "Categoria", "Fornecedor", "Lote", "Validade", "Qtde", "Un", "Mín", "Custo", "Status"],
      (data ?? []).map((p: any) => [
        fmt(p.name), fmt(p.internal_code), fmt(p.categories?.name), fmt(p.suppliers?.name),
        fmt(p.batch), p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("pt-BR") : "-",
        fmt(p.quantity), fmt(p.unit), fmt(p.min_stock), currency(Number(p.cost_value)),
        statusLabel[statusOf(p.quantity, p.min_stock, p.expiry_date)],
      ]));
    return doc;
  }

  async function pdfCategorias() {
    const { data } = await supabase.from("categories").select("*").order("name");
    const doc = new jsPDF();
    header(doc, "Categorias de Produto");
    tableFor(doc, ["Nome", "Criado em"], (data ?? []).map((c: any) => [fmt(c.name), c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "-"]));
    return doc;
  }

  async function pdfFornecedores() {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Fornecedores");
    tableFor(doc,
      ["Nome", "CNPJ", "Contato", "Telefone", "E-mail", "Endereço"],
      (data ?? []).map((s: any) => [fmt(s.name), fmt(s.cnpj), fmt(s.contact_name), fmt(s.phone), fmt(s.email), fmt(s.address)]));
    return doc;
  }

  async function pdfMovs() {
    const { data } = await supabase.from("movements").select("*, products(name)").order("created_at", { ascending: false });
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Movimentações de Estoque");
    tableFor(doc,
      ["Data", "Produto", "Tipo", "Qtde", "Motivo", "Usuário"],
      (data ?? []).map((m: any) => [
        new Date(m.created_at).toLocaleString("pt-BR"),
        fmt(m.products?.name),
        m.type === "in" ? "Entrada" : "Saída",
        fmt(m.quantity), fmt(m.reason), fmt(m.user_id?.slice(0, 8)),
      ]));
    return doc;
  }

  async function pdfClientes() {
    const { data } = await supabase.from("clientes").select("*").order("nome");
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Clientes");
    tableFor(doc,
      ["Nome", "CPF", "Nascimento", "Telefone", "E-mail", "Cidade", "UF", "Profissão"],
      (data ?? []).map((c: any) => [
        fmt(c.nome), fmt(c.cpf),
        c.data_nascimento ? new Date(c.data_nascimento).toLocaleDateString("pt-BR") : "-",
        fmt(c.telefone), fmt(c.email), fmt(c.cidade), fmt(c.estado), fmt(c.profissao),
      ]));
    return doc;
  }

  async function pdfAnamneses() {
    const { data } = await supabase.from("anamneses").select("*, clientes(nome)").order("created_at", { ascending: false });
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Fichas de Anamnese");
    tableFor(doc,
      ["Data", "Cliente", "Peso", "Altura", "IMC", "Alergias", "Medicamentos", "Observações"],
      (data ?? []).map((a: any) => {
        const imc = a.peso && a.altura ? (Number(a.peso) / (Number(a.altura) * Number(a.altura))).toFixed(1) : "-";
        return [
          new Date(a.created_at).toLocaleDateString("pt-BR"),
          fmt(a.clientes?.nome), fmt(a.peso), fmt(a.altura), imc,
          fmt(a.alergias), fmt(a.medicamentos), fmt(a.observacoes),
        ];
      }));
    return doc;
  }

  async function pdfServicos() {
    const { data } = await supabase.from("services").select("*, service_categories(name), professionals(name)").order("name");
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Serviços");
    tableFor(doc,
      ["Nome", "Categoria", "Profissional", "Duração (min)", "Preço", "Descrição"],
      (data ?? []).map((s: any) => [
        fmt(s.name), fmt(s.service_categories?.name), fmt(s.professionals?.name),
        fmt(s.duration_minutes), currency(Number(s.price)), fmt(s.description),
      ]));
    return doc;
  }

  async function pdfProfissionais() {
    const { data } = await supabase.from("professionals").select("*").order("name");
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Profissionais");
    tableFor(doc,
      ["Nome", "Especialidade", "Telefone", "E-mail", "Ativo", "Google conectado"],
      (data ?? []).map((p: any) => [
        fmt(p.name), fmt(p.specialty), fmt(p.phone), fmt(p.email),
        p.active ? "Sim" : "Não",
        p.google_refresh_token ? "Sim" : "Não",
      ]));
    return doc;
  }

  async function pdfAgenda() {
    const { data } = await supabase.from("appointments").select("*, professionals(name), services(name), clientes(nome)").order("start_at", { ascending: false });
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Agendamentos");
    tableFor(doc,
      ["Início", "Fim", "Cliente", "Serviço", "Profissional", "Status", "Observações"],
      (data ?? []).map((a: any) => [
        new Date(a.start_at).toLocaleString("pt-BR"),
        a.end_at ? new Date(a.end_at).toLocaleString("pt-BR") : "-",
        fmt(a.clientes?.nome), fmt(a.services?.name), fmt(a.professionals?.name),
        fmt(a.status), fmt(a.notes),
      ]));
    return doc;
  }

  async function pdfUsuarios() {
    const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");
    const { data: roles } = await supabase.from("user_roles").select("*");
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const doc = new jsPDF();
    header(doc, "Usuários do sistema");
    tableFor(doc,
      ["Nome", "E-mail", "Papéis"],
      (profiles ?? []).map((p: any) => [fmt(p.full_name), fmt(p.email), (rolesByUser.get(p.id) ?? ["user"]).join(", ")]));
    return doc;
  }

  async function pdfAuditoria() {
    const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000);
    const doc = new jsPDF({ orientation: "landscape" });
    header(doc, "Auditoria (últimos 2000 eventos)");
    tableFor(doc,
      ["Data", "Usuário", "Ação", "Entidade", "ID entidade", "Detalhes"],
      (data ?? []).map((l: any) => [
        new Date(l.created_at).toLocaleString("pt-BR"),
        fmt(l.user_id?.slice(0, 8)), fmt(l.action), fmt(l.entity),
        fmt(l.entity_id?.slice(0, 8)), fmt(l.details),
      ]));
    return doc;
  }

  async function pdfCompleto() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text("Taty Gomes Alta Estética", 14, 20);
    doc.setFontSize(12);
    doc.text("Backup completo do sistema", 14, 28);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 34);

    const sections: Array<[string, () => Promise<jsPDF>]> = [
      ["Produtos", pdfProdutos],
      ["Categorias", pdfCategorias],
      ["Fornecedores", pdfFornecedores],
      ["Movimentações", pdfMovs],
      ["Clientes", pdfClientes],
      ["Anamneses", pdfAnamneses],
      ["Serviços", pdfServicos],
      ["Profissionais", pdfProfissionais],
      ["Agenda", pdfAgenda],
      ["Usuários", pdfUsuarios],
      ["Auditoria", pdfAuditoria],
    ];

    for (const [title, gen] of sections) {
      doc.addPage();
      doc.setFontSize(16);
      doc.text(title, 14, 16);
      // reuse: fetch and render inline
      const partial = await gen();
      const pageCount = (partial as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        if (i > 1 || true) {
          // copy page content by rendering table again is complex; simpler: append via getting pages is not trivial.
          // Instead, print title only here and rely on partial for table on new pages:
        }
      }
      // Simpler approach: re-run autoTable directly on the master doc.
    }
    return doc;
  }

  // Simpler "complete": generate each section into master doc directly
  async function pdfCompletoV2() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text("Taty Gomes Alta Estética — Backup completo", 14, 20);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 27);

    async function section(title: string, cols: string[], rowsPromise: PromiseLike<any[][]>) {
      const rows = await rowsPromise;
      doc.addPage();
      doc.setFontSize(14);
      doc.text(title, 14, 16);
      autoTable(doc, {
        startY: 22,
        head: [cols],
        body: rows,
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [194, 156, 141] },
      });
    }

    await section("Produtos",
      ["Nome", "Código", "Categoria", "Fornecedor", "Lote", "Validade", "Qtde", "Un", "Mín", "Custo", "Status"],
      supabase.from("products").select("*, categories(name), suppliers(name)").order("name").then(({ data }) =>
        (data ?? []).map((p: any) => [
          fmt(p.name), fmt(p.internal_code), fmt(p.categories?.name), fmt(p.suppliers?.name),
          fmt(p.batch), p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("pt-BR") : "-",
          fmt(p.quantity), fmt(p.unit), fmt(p.min_stock), currency(Number(p.cost_value)),
          statusLabel[statusOf(p.quantity, p.min_stock, p.expiry_date)],
        ])));

    await section("Categorias", ["Nome"],
      supabase.from("categories").select("*").order("name").then(({ data }) => (data ?? []).map((c: any) => [fmt(c.name)])));

    await section("Fornecedores", ["Nome", "CNPJ", "Contato", "Telefone", "E-mail", "Endereço"],
      supabase.from("suppliers").select("*").order("name").then(({ data }) =>
        (data ?? []).map((s: any) => [fmt(s.name), fmt(s.cnpj), fmt(s.contact_name), fmt(s.phone), fmt(s.email), fmt(s.address)])));

    await section("Movimentações", ["Data", "Produto", "Tipo", "Qtde", "Motivo"],
      supabase.from("movements").select("*, products(name)").order("created_at", { ascending: false }).then(({ data }) =>
        (data ?? []).map((m: any) => [
          new Date(m.created_at).toLocaleString("pt-BR"), fmt(m.products?.name),
          m.type === "in" ? "Entrada" : "Saída", fmt(m.quantity), fmt(m.reason),
        ])));

    await section("Clientes", ["Nome", "CPF", "Nascimento", "Telefone", "E-mail", "Cidade", "UF"],
      supabase.from("clientes").select("*").order("nome").then(({ data }) =>
        (data ?? []).map((c: any) => [
          fmt(c.nome), fmt(c.cpf),
          c.data_nascimento ? new Date(c.data_nascimento).toLocaleDateString("pt-BR") : "-",
          fmt(c.telefone), fmt(c.email), fmt(c.cidade), fmt(c.estado),
        ])));

    await section("Anamneses", ["Data", "Cliente", "Peso", "Altura", "IMC", "Alergias", "Medicamentos"],
      supabase.from("anamneses").select("*, clientes(nome)").order("created_at", { ascending: false }).then(({ data }) =>
        (data ?? []).map((a: any) => {
          const imc = a.peso && a.altura ? (Number(a.peso) / (Number(a.altura) * Number(a.altura))).toFixed(1) : "-";
          return [
            new Date(a.created_at).toLocaleDateString("pt-BR"),
            fmt(a.clientes?.nome), fmt(a.peso), fmt(a.altura), imc, fmt(a.alergias), fmt(a.medicamentos),
          ];
        })));

    await section("Serviços", ["Nome", "Categoria", "Profissional", "Duração (min)", "Preço"],
      supabase.from("services").select("*, service_categories(name), professionals(name)").order("name").then(({ data }) =>
        (data ?? []).map((s: any) => [
          fmt(s.name), fmt(s.service_categories?.name), fmt(s.professionals?.name),
          fmt(s.duration_minutes), currency(Number(s.price)),
        ])));

    await section("Profissionais", ["Nome", "Especialidade", "Telefone", "E-mail", "Ativo"],
      supabase.from("professionals").select("*").order("name").then(({ data }) =>
        (data ?? []).map((p: any) => [fmt(p.name), fmt(p.specialty), fmt(p.phone), fmt(p.email), p.active ? "Sim" : "Não"])));

    await section("Agenda", ["Início", "Cliente", "Serviço", "Profissional", "Status"],
      supabase.from("appointments").select("*, professionals(name), services(name), clientes(nome)").order("start_at", { ascending: false }).then(({ data }) =>
        (data ?? []).map((a: any) => [
          new Date(a.start_at).toLocaleString("pt-BR"),
          fmt(a.clientes?.nome), fmt(a.services?.name), fmt(a.professionals?.name), fmt(a.status),
        ])));

    const profiles = (await supabase.from("profiles").select("*").order("full_name")).data ?? [];
    const roles = (await supabase.from("user_roles").select("*")).data ?? [];
    const rolesByUser = new Map<string, string[]>();
    roles.forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    await section("Usuários", ["Nome", "E-mail", "Papéis"],
      Promise.resolve(profiles.map((p: any) => [fmt(p.full_name), fmt(p.email), (rolesByUser.get(p.id) ?? ["user"]).join(", ")])));

    await section("Auditoria (últimos 2000)", ["Data", "Usuário", "Ação", "Entidade", "Detalhes"],
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000).then(({ data }) =>
        (data ?? []).map((l: any) => [
          new Date(l.created_at).toLocaleString("pt-BR"),
          fmt(l.user_id?.slice(0, 8)), fmt(l.action), fmt(l.entity), fmt(l.details),
        ])));

    // Remove blank first page
    doc.deletePage(1);
    return doc;
  }

  if (isAdmin === null) {
    return <div className="flex items-center justify-center py-20 text-text-muted"><Loader2 className="size-5 animate-spin mr-2" /> Verificando permissões…</div>;
  }
  if (!isAdmin) return null;

  const c = counts.data ?? {};
  const sections = [
    { key: "produtos", label: "Produtos", count: c.products, fn: pdfProdutos },
    { key: "categorias", label: "Categorias", count: c.categories, fn: pdfCategorias },
    { key: "fornecedores", label: "Fornecedores", count: c.suppliers, fn: pdfFornecedores },
    { key: "movimentacoes", label: "Movimentações de estoque", count: c.movements, fn: pdfMovs },
    { key: "clientes", label: "Clientes", count: c.clientes, fn: pdfClientes },
    { key: "anamneses", label: "Fichas de anamnese", count: c.anamneses, fn: pdfAnamneses },
    { key: "servicos", label: "Serviços", count: c.services, fn: pdfServicos },
    { key: "profissionais", label: "Profissionais", count: c.professionals, fn: pdfProfissionais },
    { key: "agenda", label: "Agenda / agendamentos", count: c.appointments, fn: pdfAgenda },
    { key: "usuarios", label: "Usuários e papéis", count: c.profiles, fn: pdfUsuarios },
    { key: "auditoria", label: "Auditoria", count: c.audit_log, fn: pdfAuditoria },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Administração</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Backup em PDF</h1>
          <p className="text-sm text-text-muted mt-1">Baixe qualquer módulo ou o backup completo. Acesso restrito a administradores.</p>
        </div>
        <Button
          onClick={() => download("backup-completo", pdfCompletoV2)}
          disabled={loading !== null}
          className="bg-brand-primary hover:bg-brand-primary/90 text-white"
        >
          {loading === "backup-completo" ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Download className="size-4 mr-1.5" />}
          Backup completo (PDF único)
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.key} className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-brand-primary shrink-0" />
                <h2 className="text-sm font-semibold truncate">{s.label}</h2>
              </div>
              <p className="text-xs text-text-muted mt-1">{s.count ?? "…"} registro(s)</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              onClick={() => download(s.key, s.fn)}
            >
              {loading === s.key ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
