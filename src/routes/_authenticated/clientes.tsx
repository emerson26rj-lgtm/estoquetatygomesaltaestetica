import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, FileHeart, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Taty Gomes Alta Estética Gestão" }] }),
  component: ClientesPage,
});

type Cliente = {
  id?: string;
  nome: string;
  cpf?: string;
  rg?: string;
  data_nascimento?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  profissao?: string;
  observacoes?: string;
};

const empty: Cliente = { nome: "" };

function ClientesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Cliente>(empty);
  const [search, setSearch] = useState("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("*").order("nome")).data ?? [],
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error("Nome é obrigatório");
    const payload: any = { ...form };
    if (!payload.data_nascimento) delete payload.data_nascimento;
    if (form.id) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", form.id);
      if (error) return toast.error(error.message);
      toast.success("Cliente atualizado");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("clientes").insert({ ...payload, created_by: u.user?.id });
      if (error) return toast.error(error.message);
      toast.success("Cliente cadastrado");
    }
    setOpen(false); setForm(empty);
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este cliente e todas as anamneses vinculadas?")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluído");
    qc.invalidateQueries({ queryKey: ["clientes"] });
  }

  const filtered = clientes.filter((c: any) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cpf ?? "").includes(search) ||
    (c.telefone ?? "").includes(search)
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Cadastro</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Clientes</h1>
          <p className="text-sm text-text-muted mt-1">{clientes.length} cliente(s) cadastrado(s).</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <Plus className="size-4 mr-1.5" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Nome completo *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="space-y-1.5"><Label>CPF</Label><Input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>RG</Label><Input value={form.rg ?? ""} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Data de nascimento</Label><Input type="date" value={form.data_nascimento ?? ""} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>E-mail</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Endereço</Label><Input value={form.endereco ?? ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Estado</Label><Input maxLength={2} value={form.estado ?? ""} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Profissão</Label><Input value={form.profissao ?? ""} onChange={(e) => setForm({ ...form, profissao: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-brand-primary hover:bg-brand-primary/90 text-white">Salvar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Input placeholder="Buscar por nome, CPF ou telefone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />

      <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="p-3 font-medium">Nome</th>
                <th className="p-3 font-medium">Telefone</th>
                <th className="p-3 font-medium">CPF</th>
                <th className="p-3 font-medium">Cidade</th>
                <th className="p-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-page-bg/60">
                  <td className="p-3 font-medium">{c.nome}</td>
                  <td className="p-3 text-text-muted">{c.telefone ?? "—"}</td>
                  <td className="p-3 text-text-muted">{c.cpf ?? "—"}</td>
                  <td className="p-3 text-text-muted">{c.cidade ?? "—"}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/anamnese" search={{ cliente: c.id }}><FileHeart className="size-3.5 mr-1.5" /> Anamnese</Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setForm(c); setOpen(true); }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-text-muted">Nenhum cliente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
