import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { logAudit } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  head: () => ({ meta: [{ title: "Movimentações — Taty Gomes Alta Estética Gestão" }] }),
  component: MovsPage,
});

function MovsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  async function deleteMovement(m: any) {
    if (!confirm(`Excluir movimentação de ${m.quantity} ${m.products?.unit ?? ""} (${m.type === "in" ? "entrada" : "saída"}) de "${m.products?.name ?? ""}"? O estoque será revertido.`)) return;
    const { error } = await supabase.from("movements").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    await logAudit("delete", "movement", m.id, { type: m.type, quantity: m.quantity, product_id: m.product_id });
    toast.success("Movimentação excluída e estoque revertido");
    qc.invalidateQueries();
  }

  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("*, products(name, unit)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("id, name, unit").order("name")).data ?? [],
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Estoque</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Movimentações</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <Plus className="size-4 mr-1" /> Nova movimentação
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova movimentação</DialogTitle></DialogHeader>
            <MovForm products={products as any} onSaved={() => { setOpen(false); qc.invalidateQueries(); }} />
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="p-3 font-medium">Data</th>
                <th className="p-3 font-medium">Produto</th>
                <th className="p-3 font-medium">Tipo</th>
                <th className="p-3 font-medium text-right">Qtde</th>
                <th className="p-3 font-medium">Motivo</th>
                {isAdmin && <th className="p-3 font-medium w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} className="p-6 text-center text-text-muted">Nenhuma movimentação registrada.</td></tr>
              )}
              {movements.map((m: any) => (
                <tr key={m.id} className="border-b border-border/40 hover:bg-page-bg/60">
                  <td className="p-3 text-text-muted">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-medium">{m.products?.name ?? "—"}</td>
                  <td className="p-3">
                    {m.type === "in" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs"><ArrowDownLeft className="size-3.5" /> Entrada</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-700 text-xs"><ArrowUpRight className="size-3.5" /> Saída</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-medium">{m.quantity} {m.products?.unit}</td>
                  <td className="p-3 text-text-muted">{m.reason || "—"}</td>
                  {isAdmin && (
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => deleteMovement(m)} title="Excluir movimentação">
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MovForm({ products, onSaved }: { products: any[]; onSaved: () => void }) {
  const [form, setForm] = useState({ product_id: "", type: "out" as "in" | "out", quantity: 1, reason: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || form.quantity <= 0) return toast.error("Selecione produto e quantidade positiva.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("movements").insert({
      product_id: form.product_id,
      type: form.type,
      quantity: Number(form.quantity),
      reason: form.reason || null,
      user_id: u.user?.id,
    }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAudit("movement", "movement", data?.id, { type: form.type, quantity: form.quantity });
    toast.success("Movimentação registrada");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Produto</Label>
        <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
          <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">Entrada</SelectItem>
              <SelectItem value="out">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quantidade</Label>
          <Input type="number" step="0.01" min={0.01} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Motivo / Observação</Label>
        <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={300} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          {saving ? "Registrando..." : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
