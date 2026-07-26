import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, ShoppingCart, Eye, Lock, Unlock, ArrowDownCircle, ArrowUpCircle, Undo2, Printer } from "lucide-react";
import { toast } from "sonner";
import { currency, logAudit } from "@/lib/stock";
import { DataPagination, usePagination } from "@/components/data-pagination";
import { salesPeriodPdf, cashSessionPdf } from "@/lib/sales-reports";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas e Caixa — Taty Gomes Alta Estética Gestão" },
      { name: "description", content: "PDV, abertura e fechamento de caixa, sangrias e relatórios de vendas da clínica." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ ag: typeof s.ag === "string" ? s.ag : undefined }),
  component: VendasPage,
});

type PaymentMethod = "pix" | "debito" | "credito" | "dinheiro";
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "PIX", debito: "Cartão Débito", credito: "Cartão Crédito", dinheiro: "Dinheiro",
};
const METHODS: PaymentMethod[] = ["pix", "debito", "credito", "dinheiro"];

type Item = {
  kind: "service" | "product";
  service_id: string | null;
  product_id: string | null;
  service_name: string;
  unit_price: number;
  quantity: number;
};

const today = () => new Date().toISOString().slice(0, 10);

function VendasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { ag } = Route.useSearch();
  const [tab, setTab] = useState<"lista" | "caixa" | "sessoes">("lista");
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [soldAt, setSoldAt] = useState(today());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [discount, setDiscount] = useState<number | string>(0);
  const [pick, setPick] = useState("");
  const [pickProd, setPickProd] = useState("");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const [openAmount, setOpenAmount] = useState<number | string>(0);
  const [countedAmount, setCountedAmount] = useState<number | string>("");
  const [closeNotes, setCloseNotes] = useState("");
  const [mvType, setMvType] = useState<"in" | "out">("out");
  const [mvAmount, setMvAmount] = useState<number | string>("");
  const [mvReason, setMvReason] = useState("");

  const [caixaFrom, setCaixaFrom] = useState(today());
  const [caixaTo, setCaixaTo] = useState(today());

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () =>
      (await (supabase as any)
        .from("sales")
        .select("*, cliente:clientes(nome), professional:professionals(name), sale_items(*)")
        .order("sold_at", { ascending: false })).data ?? [],
  });
  const { data: session } = useQuery({
    queryKey: ["cash_session_open"],
    queryFn: async () =>
      (await (supabase as any).from("cash_sessions").select("*").eq("status", "open").maybeSingle()).data ?? null,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["cash_sessions"],
    queryFn: async () => (await (supabase as any).from("cash_sessions").select("*").order("opened_at", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: cashMovs = [] } = useQuery({
    queryKey: ["cash_movements", session?.id],
    enabled: !!session?.id,
    queryFn: async () => (await (supabase as any).from("cash_movements").select("*").eq("session_id", session!.id).order("created_at")).data ?? [],
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-min"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome").order("nome")).data ?? [],
  });
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals-min"],
    queryFn: async () => (await supabase.from("professionals").select("id,name").eq("active", true).order("name")).data ?? [],
  });
  const { data: services = [] } = useQuery({
    queryKey: ["services-min"],
    queryFn: async () => (await supabase.from("services").select("id,name,price").eq("active", true).order("name")).data ?? [],
  });
  const { data: produtos = [] } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => (await supabase.from("products").select("id,name,quantity,cost_value").order("name")).data ?? [],
  });


  const subtotal = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items]);
  const total = Math.max(0, subtotal - Number(discount || 0));

  const { paged, page, setPage, pageSize, setPageSize, total: totalSales, totalPages } = usePagination(sales, 25);

  // Agenda -> PDV
  useEffect(() => {
    if (!ag) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("appointments")
        .select("*, services(id,name,price)")
        .eq("id", ag)
        .maybeSingle();
      if (!data) return;
      setAppointmentId(data.id);
      setClienteId(data.client_id ?? "");
      setProfessionalId(data.professional_id ?? "");
      if (data.services) {
        setItems([{
          kind: "service", service_id: data.services.id, product_id: null,
          service_name: data.services.name,
          unit_price: Number(data.price ?? data.services.price ?? 0), quantity: 1,
        }]);
      }
      setOpen(true);
      navigate({ to: "/vendas", search: { ag: undefined }, replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ag]);

  function reset() {
    setClienteId(""); setProfessionalId(""); setPayment("pix"); setSoldAt(today());
    setNotes(""); setItems([]); setPick(""); setPickProd(""); setDiscount(0); setAppointmentId(null);
  }

  function addService() {
    const s = services.find((x: any) => x.id === pick);
    if (!s) return;
    setItems((p) => [...p, { kind: "service", service_id: s.id, product_id: null, service_name: s.name, unit_price: Number(s.price), quantity: 1 }]);
    setPick("");
  }
  function addProduct() {
    const p = produtos.find((x: any) => x.id === pickProd);
    if (!p) return;
    setItems((prev) => [...prev, {
      kind: "product", service_id: null, product_id: p.id, service_name: p.name,
      unit_price: Number((p as any).sale_price ?? (p as any).cost_value ?? 0), quantity: 1,
    }]);
    setPickProd("");
  }

  async function finalize() {
    if (items.length === 0) return toast.error("Adicione ao menos um item");
    if (!session) return toast.error("Abra o caixa antes de registrar vendas");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      const { data: sale, error: e1 } = await (supabase as any).from("sales").insert({
        cliente_id: clienteId || null,
        professional_id: professionalId || null,
        subtotal, discount: Number(discount || 0), total,
        payment_method: payment,
        sold_at: new Date(`${soldAt}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
        notes: notes || null,
        status: "paid",
        cash_session_id: session.id,
        created_by: uid,
      }).select().single();
      if (e1) { toast.error(e1.message); return; }

      const rows = items.map((i) => ({
        sale_id: sale.id, kind: i.kind,
        service_id: i.kind === "service" ? i.service_id : null,
        product_id: i.kind === "product" ? i.product_id : null,
        service_name: i.service_name, quantity: i.quantity,
        unit_price: i.unit_price, subtotal: i.unit_price * i.quantity,
      }));
      const { error: e2 } = await (supabase as any).from("sale_items").insert(rows);
      if (e2) {
        await (supabase as any).from("sales").delete().eq("id", sale.id);
        toast.error(e2.message); return;
      }

      const clienteNome = clientes.find((c: any) => c.id === clienteId)?.nome ?? "Balcão";
      const { data: fa } = await (supabase as any).from("financial_accounts").insert({
        type: "receita",
        description: `Venda ${clienteNome} · ${items.map((i) => i.service_name).join(", ")}`,
        amount: total, due_date: soldAt, payment_date: soldAt,
        status: "pago", payment_method: payment,
        cliente_id: clienteId || null, created_by: uid,
      }).select().single();
      if (fa) await (supabase as any).from("sales").update({ financial_account_id: fa.id }).eq("id", sale.id);

      if (appointmentId) {
        await (supabase as any).from("appointments").update({ status: "completed", sale_id: sale.id }).eq("id", appointmentId);
        qc.invalidateQueries({ queryKey: ["appointments"] });
      }

      await logAudit("create", "sale", sale.id, { total, payment });
      toast.success("Venda registrada · estoque, comissão e financeiro atualizados");
      setOpen(false); reset();
      ["sales", "financial_accounts", "products", "commissions", "movements"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } finally {
      setSaving(false);
    }
  }

  async function estornar(id: string) {
    if (!confirm("Estornar esta venda? Os materiais voltam ao estoque e o lançamento financeiro é removido.")) return;
    const { error } = await (supabase as any).from("sales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("delete", "sale", id, null);
    toast.success("Venda estornada e estoque restaurado");
    ["sales", "financial_accounts", "products", "commissions", "movements"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  // ---- caixa
  const sessionSales = useMemo(() => sales.filter((s: any) => s.cash_session_id === session?.id), [sales, session]);
  const sessionSummary = useMemo(() => {
    const byMethod: Record<string, number> = { pix: 0, debito: 0, credito: 0, dinheiro: 0 };
    for (const s of sessionSales) byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + Number(s.total);
    const suprimentos = cashMovs.filter((m: any) => m.type === "in").reduce((a: number, m: any) => a + Number(m.amount), 0);
    const sangrias = cashMovs.filter((m: any) => m.type === "out").reduce((a: number, m: any) => a + Number(m.amount), 0);
    const sum = Object.values(byMethod).reduce((a, b) => a + b, 0);
    const expected = Number(session?.opening_amount ?? 0) + byMethod.dinheiro + suprimentos - sangrias;
    return { byMethod, suprimentos, sangrias, sum, expected, count: sessionSales.length };
  }, [sessionSales, cashMovs, session]);

  async function abrirCaixa() {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("cash_sessions").insert({
      opening_amount: Number(openAmount || 0), opened_by: u.user?.id, status: "open",
    });
    if (error) return toast.error(error.message.includes("cash_sessions_single_open") ? "Já existe um caixa aberto" : error.message);
    toast.success("Caixa aberto");
    setOpenAmount(0);
    qc.invalidateQueries({ queryKey: ["cash_session_open"] });
    qc.invalidateQueries({ queryKey: ["cash_sessions"] });
  }

  async function lancarMovimento() {
    if (!session) return;
    const v = Number(mvAmount || 0);
    if (v <= 0) return toast.error("Informe o valor");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("cash_movements").insert({
      session_id: session.id, type: mvType, amount: v, reason: mvReason || null, created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    setMvAmount(""); setMvReason("");
    toast.success(mvType === "out" ? "Sangria registrada" : "Suprimento registrado");
    qc.invalidateQueries({ queryKey: ["cash_movements", session.id] });
  }

  async function fecharCaixa() {
    if (!session) return;
    if (countedAmount === "") return toast.error("Informe o valor conferido em dinheiro");
    const counted = Number(countedAmount);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("cash_sessions").update({
      status: "closed", closed_at: new Date().toISOString(), closed_by: u.user?.id,
      counted_amount: counted, expected_amount: sessionSummary.expected,
      difference: counted - sessionSummary.expected, notes: closeNotes || null,
    }).eq("id", session.id);
    if (error) return toast.error(error.message);
    cashSessionPdf({ ...session, counted_amount: counted, expected_amount: sessionSummary.expected, difference: counted - sessionSummary.expected, closed_at: new Date().toISOString() }, sessionSummary, sessionSales, cashMovs);
    await logAudit("update", "cash_session", session.id, { counted, expected: sessionSummary.expected });
    toast.success("Caixa fechado · comprovante gerado");
    setCountedAmount(""); setCloseNotes("");
    qc.invalidateQueries({ queryKey: ["cash_session_open"] });
    qc.invalidateQueries({ queryKey: ["cash_sessions"] });
  }

  const periodo = useMemo(() => {
    const filtered = sales.filter((s: any) => {
      const d = s.sold_at.slice(0, 10);
      return d >= caixaFrom && d <= caixaTo;
    });
    const byMethod: Record<string, { count: number; total: number }> = {
      pix: { count: 0, total: 0 }, debito: { count: 0, total: 0 },
      credito: { count: 0, total: 0 }, dinheiro: { count: 0, total: 0 },
    };
    let sum = 0;
    for (const s of filtered) {
      byMethod[s.payment_method] ??= { count: 0, total: 0 };
      byMethod[s.payment_method].count += 1;
      byMethod[s.payment_method].total += Number(s.total);
      sum += Number(s.total);
    }
    return { filtered, byMethod, sum, count: filtered.length, avg: filtered.length ? sum / filtered.length : 0 };
  }, [sales, caixaFrom, caixaTo]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Vendas</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">PDV & Controle de caixa</h1>
        </div>
        <Button
          className="bg-brand-primary hover:bg-brand-primary/90 text-white"
          onClick={() => { if (!session) { setTab("caixa"); return toast.error("Abra o caixa para registrar vendas"); } setOpen(true); }}
        >
          <Plus className="size-4 mr-1.5" /> Nova venda
        </Button>
      </header>

      <Card className={`p-4 border-0 shadow-none ring-1 ${session ? "bg-emerald-50 ring-emerald-200/70" : "bg-amber-50 ring-amber-200/70"}`}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            {session ? <Unlock className="size-4 text-emerald-700" /> : <Lock className="size-4 text-amber-700" />}
            <span className={session ? "text-emerald-800" : "text-amber-800"}>
              {session
                ? `Caixa aberto desde ${new Date(session.opened_at).toLocaleString("pt-BR")} · abertura ${currency(Number(session.opening_amount))}`
                : "Nenhum caixa aberto — abra o caixa para registrar vendas."}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setTab("caixa")}>Gerenciar caixa</Button>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="lista">Vendas</TabsTrigger>
          <TabsTrigger value="caixa">Caixa</TabsTrigger>
          <TabsTrigger value="sessoes">Histórico de caixa</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4 space-y-4">
          <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5"><Label>De</Label><Input type="date" value={caixaFrom} onChange={(e) => setCaixaFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={caixaTo} onChange={(e) => setCaixaTo(e.target.value)} /></div>
              <Button variant="outline" onClick={() => { setCaixaFrom(today()); setCaixaTo(today()); }}>Hoje</Button>
              <Button variant="outline" onClick={() => {
                const n = new Date();
                setCaixaFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10));
                setCaixaTo(new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10));
              }}>Mês atual</Button>
              <Button variant="outline" onClick={() => salesPeriodPdf(periodo.filtered, caixaFrom, caixaTo)}>
                <Printer className="size-4 mr-1.5" /> Relatório PDF
              </Button>
            </div>
          </Card>

          <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Kpi label="Total do período" value={currency(periodo.sum)} accent="text-brand-primary" sub={`${periodo.count} vendas`} />
            <Kpi label="Ticket médio" value={currency(periodo.avg)} />
            {METHODS.map((m) => (
              <Kpi key={m} label={PAYMENT_LABELS[m]} value={currency(periodo.byMethod[m].total)} sub={`${periodo.byMethod[m].count} vendas`} />
            ))}
          </section>

          <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Cliente</th>
                    <th className="p-3 font-medium">Profissional</th>
                    <th className="p-3 font-medium">Itens</th>
                    <th className="p-3 font-medium">Pagamento</th>
                    <th className="p-3 font-medium text-right">Total</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s: any) => (
                    <tr key={s.id} className="border-b border-border/40 hover:bg-page-bg/60">
                      <td className="p-3 text-text-muted">{new Date(s.sold_at).toLocaleDateString("pt-BR")}</td>
                      <td className="p-3">{s.cliente?.nome ?? "Balcão"}</td>
                      <td className="p-3 text-text-muted">{s.professional?.name ?? "—"}</td>
                      <td className="p-3 text-text-muted">{s.sale_items?.length ?? 0}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20">
                          {PAYMENT_LABELS[s.payment_method as PaymentMethod] ?? s.payment_method}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{currency(Number(s.total))}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(s)}><Eye className="size-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => estornar(s.id)} title="Estornar venda"><Undo2 className="size-3.5 text-danger" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-text-muted">Nenhuma venda registrada.</td></tr>}
                </tbody>
              </table>
            </div>
            <DataPagination page={page} totalPages={totalPages} total={totalSales} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          </Card>
        </TabsContent>

        <TabsContent value="caixa" className="mt-4 space-y-4">
          {!session ? (
            <Card className="p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none max-w-md">
              <h2 className="text-sm font-semibold">Abertura de caixa</h2>
              <p className="text-xs text-text-muted mt-1">Informe o valor em dinheiro disponível na gaveta ao iniciar o turno.</p>
              <div className="space-y-1.5 mt-4">
                <Label>Valor de abertura</Label>
                <Input type="number" step="0.01" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} />
              </div>
              <Button className="mt-4 bg-brand-primary hover:bg-brand-primary/90 text-white" onClick={abrirCaixa}>
                <Unlock className="size-4 mr-1.5" /> Abrir caixa
              </Button>
            </Card>
          ) : (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Abertura" value={currency(Number(session.opening_amount))} />
                <Kpi label="Vendas do turno" value={currency(sessionSummary.sum)} accent="text-brand-primary" sub={`${sessionSummary.count} vendas`} />
                <Kpi label="Sangrias" value={currency(sessionSummary.sangrias)} accent="text-rose-700" />
                <Kpi label="Dinheiro esperado" value={currency(sessionSummary.expected)} accent="text-emerald-700" />
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none">
                  <h2 className="text-sm font-semibold">Sangria / suprimento</h2>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={mvType} onValueChange={(v) => setMvType(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="out">Sangria (retirada)</SelectItem>
                          <SelectItem value="in">Suprimento (entrada)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Valor</Label><Input type="number" step="0.01" value={mvAmount} onChange={(e) => setMvAmount(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5 mt-3"><Label>Motivo</Label><Input value={mvReason} onChange={(e) => setMvReason(e.target.value)} placeholder="Ex.: depósito bancário" /></div>
                  <Button variant="outline" className="mt-3" onClick={lancarMovimento}>
                    {mvType === "out" ? <ArrowDownCircle className="size-4 mr-1.5" /> : <ArrowUpCircle className="size-4 mr-1.5" />} Lançar
                  </Button>
                  <div className="mt-4 divide-y divide-border/40 text-sm">
                    {cashMovs.map((m: any) => (
                      <div key={m.id} className="py-2 flex items-center justify-between">
                        <span className="text-text-muted">{new Date(m.created_at).toLocaleTimeString("pt-BR").slice(0, 5)} · {m.reason || (m.type === "out" ? "Sangria" : "Suprimento")}</span>
                        <span className={m.type === "out" ? "text-rose-700 font-medium" : "text-emerald-700 font-medium"}>
                          {m.type === "out" ? "-" : "+"}{currency(Number(m.amount))}
                        </span>
                      </div>
                    ))}
                    {cashMovs.length === 0 && <p className="py-2 text-text-muted text-xs">Nenhuma movimentação no turno.</p>}
                  </div>
                </Card>

                <Card className="p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none">
                  <h2 className="text-sm font-semibold">Fechamento de caixa</h2>
                  <div className="mt-3 space-y-1 text-sm">
                    {METHODS.map((m) => (
                      <div key={m} className="flex justify-between"><span className="text-text-muted">{PAYMENT_LABELS[m]}</span><span>{currency(sessionSummary.byMethod[m])}</span></div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-border/60 font-medium"><span>Dinheiro esperado na gaveta</span><span>{currency(sessionSummary.expected)}</span></div>
                  </div>
                  <div className="space-y-1.5 mt-4"><Label>Dinheiro conferido</Label><Input type="number" step="0.01" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} /></div>
                  {countedAmount !== "" && (
                    <p className={`text-xs mt-2 font-medium ${Number(countedAmount) - sessionSummary.expected === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      Diferença: {currency(Number(countedAmount) - sessionSummary.expected)}
                    </p>
                  )}
                  <div className="space-y-1.5 mt-3"><Label>Observações</Label><Textarea rows={2} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} /></div>
                  <Button className="mt-3 bg-brand-primary hover:bg-brand-primary/90 text-white" onClick={fecharCaixa}>
                    <Lock className="size-4 mr-1.5" /> Fechar caixa e gerar comprovante
                  </Button>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="sessoes" className="mt-4">
          <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                    <th className="p-3 font-medium">Abertura</th>
                    <th className="p-3 font-medium">Fechamento</th>
                    <th className="p-3 font-medium text-right">Valor inicial</th>
                    <th className="p-3 font-medium text-right">Esperado</th>
                    <th className="p-3 font-medium text-right">Conferido</th>
                    <th className="p-3 font-medium text-right">Diferença</th>
                    <th className="p-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s: any) => (
                    <tr key={s.id} className="border-b border-border/40">
                      <td className="p-3 text-text-muted">{new Date(s.opened_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3 text-text-muted">{s.closed_at ? new Date(s.closed_at).toLocaleString("pt-BR") : "—"}</td>
                      <td className="p-3 text-right">{currency(Number(s.opening_amount))}</td>
                      <td className="p-3 text-right">{s.expected_amount != null ? currency(Number(s.expected_amount)) : "—"}</td>
                      <td className="p-3 text-right">{s.counted_amount != null ? currency(Number(s.counted_amount)) : "—"}</td>
                      <td className={`p-3 text-right font-medium ${Number(s.difference) < 0 ? "text-rose-700" : Number(s.difference) > 0 ? "text-amber-700" : ""}`}>
                        {s.difference != null ? currency(Number(s.difference)) : "—"}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${s.status === "open" ? "bg-emerald-50 text-emerald-700 ring-emerald-200/60" : "bg-page-bg text-text-muted ring-black/5"}`}>
                          {s.status === "open" ? "Aberto" : "Fechado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-text-muted">Nenhuma sessão de caixa.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar venda</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={clienteId || "none"} onValueChange={(v) => setClienteId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Balcão / sem cliente —</SelectItem>
                    {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select value={professionalId || "none"} onValueChange={(v) => setProfessionalId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhum —</SelectItem>
                    {professionals.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Serviços</Label>
                <div className="flex gap-2">
                  <Select value={pick} onValueChange={setPick}>
                    <SelectTrigger><SelectValue placeholder="Escolher serviço" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} · {currency(Number(s.price))}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={addService}>+</Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Produtos (revenda)</Label>
                <div className="flex gap-2">
                  <Select value={pickProd} onValueChange={setPickProd}>
                    <SelectTrigger><SelectValue placeholder="Escolher produto" /></SelectTrigger>
                    <SelectContent>
                      {produtos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.quantity} em estoque</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={addProduct}>+</Button>
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <div className="rounded-md ring-1 ring-black/5 divide-y divide-border/40 bg-page-bg/60">
                {items.map((i, idx) => (
                  <div key={idx} className="p-2 flex items-center gap-2">
                    <span className="flex-1 text-sm">
                      {i.service_name}
                      <span className="ml-1.5 text-[10px] uppercase text-text-muted">{i.kind === "product" ? "produto" : "serviço"}</span>
                    </span>
                    <Input className="w-16 h-8" type="number" min={1} value={i.quantity}
                      onChange={(e) => setItems((p) => p.map((x, ix) => ix === idx ? { ...x, quantity: Number(e.target.value) || 1 } : x))} />
                    <Input className="w-24 h-8" type="number" step="0.01" value={i.unit_price}
                      onChange={(e) => setItems((p) => p.map((x, ix) => ix === idx ? { ...x, unit_price: Number(e.target.value) || 0 } : x))} />
                    <span className="w-24 text-right text-sm font-medium">{currency(i.unit_price * i.quantity)}</span>
                    <Button size="icon" variant="ghost" onClick={() => setItems((p) => p.filter((_, ix) => ix !== idx))}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Forma de pagamento</Label>
                <Select value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_LABELS[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Desconto</Label><Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Total</Label>
                <div className="h-10 flex items-center justify-end px-3 rounded-md bg-brand-primary/5 ring-1 ring-brand-primary/20 font-semibold text-brand-primary">
                  {currency(total)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={finalize} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                <ShoppingCart className="size-4 mr-1.5" /> {saving ? "Processando..." : "Finalizar venda"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalhes da venda</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-text-muted">Data:</span> {new Date(viewing.sold_at).toLocaleString("pt-BR")}</div>
                <div><span className="text-text-muted">Pagamento:</span> {PAYMENT_LABELS[viewing.payment_method as PaymentMethod]}</div>
                <div><span className="text-text-muted">Cliente:</span> {viewing.cliente?.nome ?? "Balcão"}</div>
                <div><span className="text-text-muted">Profissional:</span> {viewing.professional?.name ?? "—"}</div>
              </div>
              <div className="rounded-md ring-1 ring-black/5 divide-y divide-border/40">
                {viewing.sale_items?.map((it: any) => (
                  <div key={it.id} className="p-2 flex justify-between">
                    <span>{it.service_name} × {it.quantity}</span>
                    <span className="font-medium">{currency(Number(it.subtotal))}</span>
                  </div>
                ))}
              </div>
              {Number(viewing.discount) > 0 && (
                <div className="flex justify-between text-text-muted"><span>Desconto</span><span>-{currency(Number(viewing.discount))}</span></div>
              )}
              <div className="flex justify-between font-semibold text-base pt-2 border-t border-border/60">
                <span>Total</span><span className="text-brand-primary">{currency(Number(viewing.total))}</span>
              </div>
              {viewing.notes && <p className="text-text-muted">{viewing.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, accent = "", sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-xl font-medium tracking-tight mt-2 ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-text-muted mt-1">{sub}</p>}
    </Card>
  );
}
