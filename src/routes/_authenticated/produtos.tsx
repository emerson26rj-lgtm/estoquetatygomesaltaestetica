import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { statusOf, currency, logAudit } from "@/lib/stock";
import { StatusBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Dermasul Gestão" }] }),
  component: ProdutosPage,
});

function ProdutosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name), suppliers(name)").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("name")).data ?? [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });

  const filtered = products.filter((p: any) => {
    const t = q.toLowerCase();
    const matches = !t || p.name.toLowerCase().includes(t) || (p.internal_code ?? "").toLowerCase().includes(t) || (p.batch ?? "").toLowerCase().includes(t);
    const s = statusOf(p.quantity, p.min_stock, p.expiry_date);
    return matches && (statusFilter === "all" || statusFilter === s);
  });

  async function del(p: any) {
    if (!confirm(`Excluir "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAudit("delete", "product", p.id, { name: p.name });
    toast.success("Produto excluído");
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Cadastro</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Produtos</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <Plus className="size-4 mr-1" /> Novo produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
            <ProductForm
              initial={editing}
              categories={categories as any}
              suppliers={suppliers as any}
              onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["products"] }); }}
            />
          </DialogContent>
        </Dialog>
      </header>

      <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, código ou lote..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
            <SelectItem value="expiring">Vencendo</SelectItem>
            <SelectItem value="expired">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="p-3 font-medium">Produto</th>
                <th className="p-3 font-medium">Categoria</th>
                <th className="p-3 font-medium">Fornecedor</th>
                <th className="p-3 font-medium">Lote</th>
                <th className="p-3 font-medium">Validade</th>
                <th className="p-3 font-medium text-right">Estoque</th>
                <th className="p-3 font-medium text-right">Custo</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-text-muted">Nenhum produto encontrado.</td></tr>
              )}
              {filtered.map((p: any) => {
                const s = statusOf(p.quantity, p.min_stock, p.expiry_date);
                return (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-page-bg/60">
                    <td className="p-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-[11px] text-text-muted">{p.internal_code || "sem código"}</p>
                    </td>
                    <td className="p-3 text-text-muted">{p.categories?.name || "—"}</td>
                    <td className="p-3 text-text-muted">{p.suppliers?.name || "—"}</td>
                    <td className="p-3 text-text-muted">{p.batch || "—"}</td>
                    <td className="p-3 text-text-muted">{p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-3 text-right font-medium">{p.quantity} {p.unit}</td>
                    <td className="p-3 text-right text-text-muted">{currency(Number(p.cost_value))}</td>
                    <td className="p-3"><StatusBadge status={s} /></td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true); }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => del(p)} className="text-danger hover:text-danger">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProductForm({ initial, categories, suppliers, onSaved }: { initial: any; categories: any[]; suppliers: any[]; onSaved: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    internal_code: initial?.internal_code ?? "",
    category_id: initial?.category_id ?? "",
    supplier_id: initial?.supplier_id ?? "",
    batch: initial?.batch ?? "",
    expiry_date: initial?.expiry_date ?? "",
    quantity: initial?.quantity ?? 0,
    min_stock: initial?.min_stock ?? 0,
    cost_value: initial?.cost_value ?? 0,
    unit: initial?.unit ?? "un",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  async function createCategory() {
    const name = newCat.trim();
    if (!name) return toast.error("Informe um nome de categoria");
    const { data, error } = await supabase.from("categories").insert({ name }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Categoria criada");
    setNewCat("");
    setCreatingCat(false);
    await qc.invalidateQueries({ queryKey: ["categories"] });
    setForm((f) => ({ ...f, category_id: data.id }));
  }


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const payload = {
      ...form,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      expiry_date: form.expiry_date || null,
      internal_code: form.internal_code || null,
      quantity: Number(form.quantity),
      min_stock: Number(form.min_stock),
      cost_value: Number(form.cost_value),
    };
    const res = initial
      ? await supabase.from("products").update(payload).eq("id", initial.id).select().single()
      : await supabase.from("products").insert(payload).select().single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    await logAudit(initial ? "update" : "create", "product", res.data?.id, { name: form.name });
    toast.success(initial ? "Produto atualizado" : "Produto criado");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} required /></div>
      <div className="space-y-1.5"><Label>Código interno</Label><Input value={form.internal_code} onChange={(e) => setForm({ ...form, internal_code: e.target.value })} maxLength={50} /></div>
      <div className="space-y-1.5"><Label>Unidade</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} maxLength={10} /></div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        {creatingCat ? (
          <div className="flex gap-2">
            <Input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nome da nova categoria" maxLength={80} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createCategory(); } }} />
            <Button type="button" size="sm" onClick={createCategory} className="bg-brand-primary hover:bg-brand-primary/90 text-white">Criar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setCreatingCat(false); setNewCat(""); }}>Cancelar</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Select value={form.category_id || undefined} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" size="icon" variant="outline" onClick={() => setCreatingCat(true)} title="Nova categoria"><Plus className="size-4" /></Button>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Fornecedor</Label>
        <Select value={form.supplier_id || undefined} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Lote</Label><Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} maxLength={80} /></div>
      <div className="space-y-1.5"><Label>Validade</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Quantidade</Label><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value as any })} /></div>
      <div className="space-y-1.5"><Label>Estoque mínimo</Label><Input type="number" step="0.01" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value as any })} /></div>
      <div className="space-y-1.5"><Label>Valor de custo (R$)</Label><Input type="number" step="0.01" value={form.cost_value} onChange={(e) => setForm({ ...form, cost_value: e.target.value as any })} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
      <div className="col-span-2 flex justify-end gap-2 mt-2">
        <Button type="submit" disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
