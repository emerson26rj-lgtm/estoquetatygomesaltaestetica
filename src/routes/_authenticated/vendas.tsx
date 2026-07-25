import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, ShoppingCart, Eye } from "lucide-react";
import { toast } from "sonner";
import { currency, logAudit } from "@/lib/stock";
import { DataPagination, usePagination } from "@/components/data-pagination";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Taty Gomes Alta Estética Gestão" }] }),
  component: VendasPage,
});

type PaymentMethod = "pix" | "debito" | "credito" | "dinheiro";
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "PIX",
  debito: "Cartão Débito",
  credito: "Cartão Crédito",
  dinheiro: "Dinheiro",
};

type Item = { service_id: string; service_name: string; unit_price: number; quantity: number };

function VendasPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"lista" | "caixa">("lista");
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState<string>("");
  const [professionalId, setProfessionalId] = useState<string>("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [soldAt, setSoldAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [pickService, setPickService] = useState<string>("");
  const [viewing, setViewing] = useState<any | null>(null);

  const [caixaFrom, setCaixaFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [caixaTo, setCaixaTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () =>
      (await (supabase as any)
        .from("sales")
        .select("*, cliente:clientes(nome), professional:professionals(name), sale_items(*)")
        .order("sold_at", { ascending: false })).data ?? [],
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

  const total = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items]);

  const { paged, page, setPage, pageSize, setPageSize, total: totalSales, totalPages } = usePagination(sales, 25);

  function reset() {
    setClienteId(""); setProfessionalId(""); setPayment("pix");
    setSoldAt(new Date().toISOString().slice(0, 10)); setNotes(""); setItems([]); setPickService("");
  }

  function addItem() {
    if (!pickService) return;
    const s = services.find((x: any) => x.id === pickService);
    if (!s) return;
    setItems((prev) => [...prev, { service_id: s.id, service_name: s.name, unit_price: Number(s.price), quantity: 1 }]);
    setPickService("");
  }

  async function finalize() {
    if (items.length === 0) return toast.error("Adicione ao menos um serviço");
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;

    // 1) sale
    const { data: sale, error: e1 } = await (supabase as any)
      .from("sales")
      .insert({
        cliente_id: clienteId || null,
        professional_id: professionalId || null,
        total,
        payment_method: payment,
        sold_at: new Date(soldAt).toISOString(),
        notes: notes || null,
        created_by: uid,
      })
      .select()
      .single();
    if (e1) return toast.error(e1.message);

    // 2) items (trigger dá baixa no estoque via ficha técnica)
    const rows = items.map((i) => ({
      sale_id: sale.id,
      service_id: i.service_id,
      service_name: i.service_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      subtotal: i.unit_price * i.quantity,
    }));
    const { error: e2 } = await (supabase as any).from("sale_items").insert(rows);
    if (e2) {
      await (supabase as any).from("sales").delete().eq("id", sale.id);
      return toast.error(e2.message);
    }

    // 3) conta a receber já paga
    const clienteNome = clientes.find((c: any) => c.id === clienteId)?.nome ?? "Balcão";
    const { data: fa, error: e3 } = await (supabase as any)
      .from("financial_accounts")
      .insert({
        type: "receita",
        description: `Venda ${clienteNome} · ${items.map((i) => i.service_name).join(", ")}`,
        amount: total,
        due_date: soldAt,
        payment_date: soldAt,
        status: "pago",
        payment_method: payment,
        cliente_id: clienteId || null,
        created_by: uid,
      })
      .select()
      .single();
    if (!e3 && fa) {
      await (supabase as any).from("sales").update({ financial_account_id: fa.id }).eq("id", sale.id);
    }

    await logAudit("create", "sale", sale.id, { total, payment });
    toast.success("Venda registrada, estoque atualizado e lançada no financeiro");
    setOpen(false); reset();
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["financial_accounts"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function removeSale(id: string) {
    if (!confirm("Excluir esta venda? O lançamento financeiro será removido. A baixa no estoque NÃO é revertida automaticamente.")) return;
    const { error } = await (supabase as any).from("sales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Venda excluída");
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["financial_accounts"] });
  }

  // Fechamento de caixa
  const caixa = useMemo(() => {
    const from = caixaFrom;
    const to = caixaTo;
    const filtered = sales.filter((s: any) => {
      const d = s.sold_at.slice(0, 10);
      return d >= from && d <= to;
    });
    const byMethod: Record<string, { count: number; total: number }> = {
      pix: { count: 0, total: 0 }, debito: { count: 0, total: 0 },
      credito: { count: 0, total: 0 }, dinheiro: { count: 0, total: 0 },
    };
    let sum = 0, count = filtered.length;
    for (const s of filtered) {
      byMethod[s.payment_method] ??= { count: 0, total: 0 };
      byMethod[s.payment_method].count += 1;
      byMethod[s.payment_method].total += Number(s.total);
      sum += Number(s.total);
    }
    return { filtered, byMethod, sum, count };
  }, [sales, caixaFrom, caixaTo]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Vendas</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">PDV & Fechamento de caixa</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <Plus className="size-4 mr-1.5" /> Nova venda
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
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

              <div className="space-y-1.5">
                <Label>Serviços</Label>
                <div className="flex gap-2">
                  <Select value={pickService} onValueChange={setPickService}>
                    <SelectTrigger><SelectValue placeholder="Escolher serviço" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} · {currency(Number(s.price))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={addItem}>Adicionar</Button>
                </div>
                {items.length > 0 && (
                  <div className="mt-2 rounded-md ring-1 ring-black/5 divide-y divide-border/40 bg-page-bg/60">
                    {items.map((i, idx) => (
                      <div key={idx} className="p-2 flex items-center gap-2">
                        <span className="flex-1 text-sm">{i.service_name}</span>
                        <Input className="w-20 h-8" type="number" min={1} value={i.quantity}
                          onChange={(e) => setItems((p) => p.map((x, ix) => ix === idx ? { ...x, quantity: Number(e.target.value) || 1 } : x))} />
                        <Input className="w-28 h-8" type="number" step="0.01" value={i.unit_price}
                          onChange={(e) => setItems((p) => p.map((x, ix) => ix === idx ? { ...x, unit_price: Number(e.target.value) || 0 } : x))} />
                        <span className="w-24 text-right text-sm font-medium">{currency(i.unit_price * i.quantity)}</span>
                        <Button size="icon" variant="ghost" onClick={() => setItems((p) => p.filter((_, ix) => ix !== idx))}>
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Forma de pagamento</Label>
                  <Select value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["pix", "debito", "credito", "dinheiro"] as PaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>{PAYMENT_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
                </div>
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
                <Button onClick={finalize} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                  <ShoppingCart className="size-4 mr-1.5" /> Finalizar venda
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="lista">Vendas</TabsTrigger>
          <TabsTrigger value="caixa">Fechamento de caixa</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4">
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
                          <Button size="sm" variant="ghost" onClick={() => removeSale(s.id)}><Trash2 className="size-3.5 text-danger" /></Button>
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
          <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5"><Label>De</Label><Input type="date" value={caixaFrom} onChange={(e) => setCaixaFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={caixaTo} onChange={(e) => setCaixaTo(e.target.value)} /></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { const d = new Date().toISOString().slice(0,10); setCaixaFrom(d); setCaixaTo(d); }}>Hoje</Button>
                <Button variant="outline" onClick={() => {
                  const now = new Date();
                  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
                  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0,10);
                  setCaixaFrom(first); setCaixaTo(last);
                }}>Mês atual</Button>
              </div>
            </div>
          </Card>

          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Total do período" value={currency(caixa.sum)} accent="text-brand-primary" />
            <Kpi label="PIX" value={currency(caixa.byMethod.pix.total)} sub={`${caixa.byMethod.pix.count} vendas`} />
            <Kpi label="Débito" value={currency(caixa.byMethod.debito.total)} sub={`${caixa.byMethod.debito.count} vendas`} />
            <Kpi label="Crédito" value={currency(caixa.byMethod.credito.total)} sub={`${caixa.byMethod.credito.count} vendas`} />
            <Kpi label="Dinheiro" value={currency(caixa.byMethod.dinheiro.total)} sub={`${caixa.byMethod.dinheiro.count} vendas`} />
          </section>

          <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-text-muted">Detalhamento</p>
                <p className="text-sm font-medium mt-1">{caixa.count} venda(s) · {currency(caixa.sum)}</p>
              </div>
              <Button variant="outline" onClick={() => window.print()}>Imprimir</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Cliente</th>
                    <th className="p-3 font-medium">Pagamento</th>
                    <th className="p-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {caixa.filtered.map((s: any) => (
                    <tr key={s.id} className="border-b border-border/40">
                      <td className="p-3 text-text-muted">{new Date(s.sold_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3">{s.cliente?.nome ?? "Balcão"}</td>
                      <td className="p-3">{PAYMENT_LABELS[s.payment_method as PaymentMethod] ?? s.payment_method}</td>
                      <td className="p-3 text-right font-medium">{currency(Number(s.total))}</td>
                    </tr>
                  ))}
                  {caixa.filtered.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-text-muted">Sem vendas no período.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

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
