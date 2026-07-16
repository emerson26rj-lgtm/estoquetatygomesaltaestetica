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
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { currency } from "@/lib/stock";
import { DataPagination, usePagination } from "@/components/data-pagination";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Taty Gomes Alta Estética Gestão" }] }),
  component: FinanceiroPage,
});

type Account = {
  id?: string;
  type: "receivable" | "payable";
  description: string;
  amount: number | string;
  due_date?: string;
  paid_at?: string | null;
  status?: "open" | "paid" | "overdue";
  category_id?: string | null;
  cliente_id?: string | null;
  supplier_id?: string | null;
  notes?: string;
};

function FinanceiroPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"receivable" | "payable">("receivable");
  const [editing, setEditing] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial_accounts"],
    queryFn: async () => (await (supabase as any).from("financial_accounts").select("*").order("due_date", { ascending: false })).data ?? [],
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["financial_categories"],
    queryFn: async () => (await (supabase as any).from("financial_categories").select("*").order("name")).data ?? [],
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome").order("nome")).data ?? [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name").order("name")).data ?? [],
  });

  const filtered = accounts.filter((a: any) => a.type === tab);
  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(filtered, 25);

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const receivableOpen = accounts.filter((a: any) => a.type === "receivable" && a.status !== "paid").reduce((s: number, a: any) => s + Number(a.amount), 0);
    const payableOpen = accounts.filter((a: any) => a.type === "payable" && a.status !== "paid").reduce((s: number, a: any) => s + Number(a.amount), 0);
    const overdue = accounts.filter((a: any) => a.status !== "paid" && a.due_date && a.due_date < today).reduce((s: number, a: any) => s + Number(a.amount), 0);
    const monthKey = new Date().toISOString().slice(0, 7);
    const paidThisMonth = accounts.filter((a: any) => a.status === "paid" && a.paid_at?.slice(0, 7) === monthKey);
    const income = paidThisMonth.filter((a: any) => a.type === "receivable").reduce((s: number, a: any) => s + Number(a.amount), 0);
    const expense = paidThisMonth.filter((a: any) => a.type === "payable").reduce((s: number, a: any) => s + Number(a.amount), 0);
    return { receivableOpen, payableOpen, overdue, income, expense, net: income - expense };
  }, [accounts]);

  function novo(type: "receivable" | "payable") {
    setEditing({ type, description: "", amount: "", due_date: new Date().toISOString().slice(0, 10), status: "open" });
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    const payload: any = {
      type: editing.type,
      description: editing.description,
      amount: Number(editing.amount),
      due_date: editing.due_date || null,
      category_id: editing.category_id || null,
      cliente_id: editing.cliente_id || null,
      supplier_id: editing.supplier_id || null,
      notes: editing.notes || null,
      status: editing.status || "open",
      paid_at: editing.paid_at || null,
    };
    if (editing.id) {
      const { error } = await (supabase as any).from("financial_accounts").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("financial_accounts").insert({ ...payload, created_by: u.user?.id });
      if (error) return toast.error(error.message);
    }
    toast.success("Salvo");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["financial_accounts"] });
  }

  async function marcarPago(a: any) {
    const { error } = await (supabase as any).from("financial_accounts").update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Baixa confirmada");
    qc.invalidateQueries({ queryKey: ["financial_accounts"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await (supabase as any).from("financial_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["financial_accounts"] });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Financeiro</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Contas a pagar e receber</h1>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="A Receber (aberto)" value={currency(kpis.receivableOpen)} accent="text-emerald-700" />
        <Kpi label="A Pagar (aberto)" value={currency(kpis.payableOpen)} accent="text-rose-700" />
        <Kpi label="Em atraso" value={currency(kpis.overdue)} accent={kpis.overdue > 0 ? "text-danger" : ""} />
        <Kpi label="Resultado do mês" value={currency(kpis.net)} accent={kpis.net >= 0 ? "text-emerald-700" : "text-rose-700"} />
      </section>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setPage(1); }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="receivable">A Receber</TabsTrigger>
            <TabsTrigger value="payable">A Pagar</TabsTrigger>
          </TabsList>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => novo(tab)} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                <Plus className="size-4 mr-1.5" /> Novo lançamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing?.type === "receivable" ? "Conta a receber" : "Conta a pagar"}</DialogTitle></DialogHeader>
              {editing && (
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Descrição</Label><Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Valor</Label><Input type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={editing.due_date ?? ""} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Select value={editing.category_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, category_id: v === "none" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhuma —</SelectItem>
                        {cats.filter((c: any) => c.type === editing.type).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {editing.type === "receivable" && (
                    <div className="space-y-1.5">
                      <Label>Cliente</Label>
                      <Select value={editing.cliente_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, cliente_id: v === "none" ? null : v })}>
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Nenhum —</SelectItem>
                          {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {editing.type === "payable" && (
                    <div className="space-y-1.5">
                      <Label>Fornecedor</Label>
                      <Select value={editing.supplier_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, supplier_id: v === "none" ? null : v })}>
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Nenhum —</SelectItem>
                          {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={save} className="bg-brand-primary hover:bg-brand-primary/90 text-white">Salvar</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value={tab} className="mt-4">
          <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                    <th className="p-3 font-medium">Descrição</th>
                    <th className="p-3 font-medium">Vencimento</th>
                    <th className="p-3 font-medium text-right">Valor</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((a: any) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isOverdue = a.status !== "paid" && a.due_date && a.due_date < today;
                    return (
                      <tr key={a.id} className="border-b border-border/40 hover:bg-page-bg/60">
                        <td className="p-3">{a.description}</td>
                        <td className="p-3 text-text-muted">{a.due_date ? new Date(a.due_date).toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="p-3 text-right font-medium">{currency(Number(a.amount))}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${
                            a.status === "paid" ? "bg-emerald-50 text-emerald-700 ring-emerald-200/60"
                            : isOverdue ? "bg-red-100 text-red-800 ring-red-300/60"
                            : "bg-amber-50 text-amber-700 ring-amber-200/60"
                          }`}>
                            {a.status === "paid" ? "Pago" : isOverdue ? "Vencido" : "Aberto"}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            {a.status !== "paid" && <Button size="sm" variant="outline" onClick={() => marcarPago(a)}><Check className="size-3.5 mr-1" /> Baixar</Button>}
                            <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="size-3.5 text-danger" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-text-muted">Nenhum lançamento.</td></tr>}
                </tbody>
              </table>
            </div>
            <DataPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-xl font-medium tracking-tight mt-2 ${accent}`}>{value}</p>
    </Card>
  );
}
