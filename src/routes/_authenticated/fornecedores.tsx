import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { logAudit } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({ meta: [{ title: "Fornecedores — Dermasul Gestão" }] }),
  component: FornecedoresPage,
});

function FornecedoresPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });

  async function del(s: any) {
    if (!confirm(`Excluir fornecedor "${s.name}"?`)) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await logAudit("delete", "supplier", s.id, { name: s.name });
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Cadastro</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Fornecedores</h1>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <Plus className="size-4 mr-1" /> Novo fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} fornecedor</DialogTitle></DialogHeader>
            <SupplierForm initial={editing} onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); }} />
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suppliers.length === 0 && (
          <Card className="col-span-full p-8 text-center text-sm text-text-muted bg-surface ring-1 ring-black/5 border-0 shadow-none">
            Nenhum fornecedor cadastrado. Apenas administradores podem cadastrar.
          </Card>
        )}
        {suppliers.map((s: any) => (
          <Card key={s.id} className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-[11px] text-text-muted truncate">{s.contact_name || "—"}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="size-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => del(s)} className="text-danger"><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs text-text-muted">
              {s.email && <p>{s.email}</p>}
              {s.phone && <p>{s.phone}</p>}
              {s.cnpj && <p>CNPJ: {s.cnpj}</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SupplierForm({ initial, onSaved }: { initial: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    contact_name: initial?.contact_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    cnpj: initial?.cnpj ?? "",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const res = initial
      ? await supabase.from("suppliers").update(form).eq("id", initial.id).select().single()
      : await supabase.from("suppliers").insert(form).select().single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    await logAudit(initial ? "update" : "create", "supplier", res.data?.id, { name: form.name });
    toast.success("Salvo");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={150} /></div>
      <div className="space-y-1.5"><Label>Contato</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} maxLength={100} /></div>
      <div className="space-y-1.5"><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} maxLength={20} /></div>
      <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} /></div>
      <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
      <div className="col-span-2 flex justify-end">
        <Button type="submit" disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
