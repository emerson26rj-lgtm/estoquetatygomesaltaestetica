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
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, Settings2, X, Users, Calendar as CalendarIcon } from "lucide-react";
import { currency, logAudit } from "@/lib/stock";
import { useServerFn } from "@tanstack/react-start";
import { getGoogleAuthUrl, disconnectGoogle } from "@/lib/appointments.functions";

export const Route = createFileRoute("/_authenticated/servicos")({
  head: () => ({ meta: [{ title: "Serviços — Taty Gomes Alta Estética Gestão" }] }),
  component: ServicosPage,
});

function ServicosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_categories(name), professionals(id, name), service_products(id, quantity, products(id, name, unit))")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["service_categories"],
    queryFn: async () => (await supabase.from("service_categories").select("*").order("name")).data ?? [],
  });
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => (await supabase.from("professionals").select("*").order("name")).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-services"],
    queryFn: async () => (await supabase.from("products").select("id, name, unit").order("name")).data ?? [],
  });

  const filtered = services.filter((s: any) => {
    const t = q.toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || (s.description ?? "").toLowerCase().includes(t);
  });

  async function del(s: any) {
    if (!confirm(`Excluir serviço "${s.name}"?`)) return;
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await logAudit("delete", "service", s.id, { name: s.name });
    toast.success("Serviço excluído");
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  async function delCategory(c: any) {
    if (!confirm(`Excluir categoria "${c.name}"?`)) return;
    const { error } = await supabase.from("service_categories").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    qc.invalidateQueries({ queryKey: ["service_categories"] });
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  async function delProf(p: any) {
    if (!confirm(`Excluir profissional "${p.name}"?`)) return;
    const { error } = await supabase.from("professionals").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Profissional excluído");
    qc.invalidateQueries({ queryKey: ["professionals"] });
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Cadastro</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Serviços</h1>
        </div>
        <div className="flex gap-2">
          <Dialog open={profOpen} onOpenChange={setProfOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Users className="size-4 mr-1" /> Profissionais</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Gerenciar profissionais</DialogTitle></DialogHeader>
              <ProfessionalManager professionals={professionals as any} onDel={delProf} />
            </DialogContent>
          </Dialog>
          <Dialog open={catOpen} onOpenChange={setCatOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Settings2 className="size-4 mr-1" /> Categorias</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Gerenciar categorias de serviço</DialogTitle></DialogHeader>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {categories.length === 0 && <p className="text-sm text-text-muted text-center py-4">Nenhuma categoria cadastrada.</p>}
                {categories.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-page-bg/60 border border-border/40">
                    <span className="text-sm font-medium">{c.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => delCategory(c)} className="text-danger hover:text-danger h-7 w-7 p-0">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                <Plus className="size-4 mr-1" /> Novo serviço
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
              <ServiceForm
                initial={editing}
                categories={categories as any}
                professionals={professionals as any}
                products={products as any}
                onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["services"] }); }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou descrição..." className="pl-9" />
        </div>
      </Card>

      <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="p-3 font-medium">Serviço</th>
                <th className="p-3 font-medium">Categoria</th>
                <th className="p-3 font-medium">Profissional</th>
                <th className="p-3 font-medium text-right">Duração</th>
                <th className="p-3 font-medium text-right">Preço</th>
                <th className="p-3 font-medium">Produtos</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-text-muted">Nenhum serviço encontrado.</td></tr>
              )}
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-b border-border/40 hover:bg-page-bg/60">
                  <td className="p-3">
                    <p className="font-medium">{s.name}</p>
                    {s.description && <p className="text-[11px] text-text-muted line-clamp-1">{s.description}</p>}
                  </td>
                  <td className="p-3 text-text-muted">{s.service_categories?.name || "—"}</td>
                  <td className="p-3 text-text-muted">{s.professionals?.name || "—"}</td>
                  <td className="p-3 text-right text-text-muted">{s.duration_minutes ? `${s.duration_minutes} min` : "—"}</td>
                  <td className="p-3 text-right font-medium">{currency(Number(s.price))}</td>
                  <td className="p-3 text-text-muted">{s.service_products?.length ?? 0}</td>
                  <td className="p-3">
                    <Badge variant={s.active ? "default" : "secondary"} className={s.active ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15" : ""}>
                      {s.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setOpen(true); }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => del(s)} className="text-danger hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ServiceForm({ initial, categories, professionals, products, onSaved }: { initial: any; categories: any[]; professionals: any[]; products: any[]; onSaved: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price: initial?.price ?? 0,
    duration_minutes: initial?.duration_minutes ?? 0,
    category_id: initial?.category_id ?? "",
    professional_ref_id: initial?.professional_ref_id ?? "",
    active: initial?.active ?? true,
    notes: initial?.notes ?? "",
  });
  const [items, setItems] = useState<Array<{ product_id: string; quantity: number }>>(
    initial?.service_products?.map((sp: any) => ({ product_id: sp.products?.id ?? sp.product_id, quantity: Number(sp.quantity) })) ?? []
  );
  const [addProdId, setAddProdId] = useState<string>("");
  const [addQty, setAddQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  async function createCategory() {
    const name = newCat.trim();
    if (!name) return toast.error("Informe um nome de categoria");
    const { data, error } = await supabase.from("service_categories").insert({ name }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Categoria criada");
    setNewCat("");
    setCreatingCat(false);
    await qc.invalidateQueries({ queryKey: ["service_categories"] });
    setForm((f) => ({ ...f, category_id: data.id }));
  }

  function addItem() {
    if (!addProdId) return toast.error("Selecione um produto");
    if (items.some((i) => i.product_id === addProdId)) return toast.error("Produto já adicionado");
    setItems([...items, { product_id: addProdId, quantity: Number(addQty) || 1 }]);
    setAddProdId("");
    setAddQty(1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      duration_minutes: Number(form.duration_minutes),
      category_id: form.category_id || null,
      professional_ref_id: form.professional_ref_id || null,
      active: form.active,
      notes: form.notes || null,
    };
    const res = initial
      ? await supabase.from("services").update(payload).eq("id", initial.id).select().single()
      : await supabase.from("services").insert(payload).select().single();
    if (res.error) { setSaving(false); return toast.error(res.error.message); }
    const serviceId = res.data!.id;

    // Sync service_products
    await supabase.from("service_products").delete().eq("service_id", serviceId);
    if (items.length > 0) {
      const rows = items.map((i) => ({ service_id: serviceId, product_id: i.product_id, quantity: i.quantity }));
      const ins = await supabase.from("service_products").insert(rows);
      if (ins.error) { setSaving(false); return toast.error(ins.error.message); }
    }

    setSaving(false);
    await logAudit(initial ? "update" : "create", "service", serviceId, { name: form.name });
    toast.success(initial ? "Serviço atualizado" : "Serviço criado");
    onSaved();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} required /></div>
      <div className="col-span-2 space-y-1.5"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></div>
      <div className="space-y-1.5"><Label>Preço (R$)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value as any })} /></div>
      <div className="space-y-1.5"><Label>Duração (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value as any })} /></div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        {creatingCat ? (
          <div className="flex gap-2">
            <Input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nome da categoria" maxLength={80} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createCategory(); } }} />
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
        <Label>Profissional responsável</Label>
        <Select value={form.professional_ref_id || undefined} onValueChange={(v) => setForm({ ...form, professional_ref_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>{professionals.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ""}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[11px] text-text-muted">Cadastre profissionais pelo botão "Profissionais" no topo.</p>
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label>Status</Label>
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Serviço ativo
          </label>
        </div>
      </div>

      <div className="col-span-2 space-y-2 rounded-md border border-border/60 p-3">
        <Label>Produtos consumidos no serviço</Label>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Select value={addProdId || undefined} onValueChange={setAddProdId}>
              <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
              <SelectContent>
                {products.filter((p: any) => !items.some((i) => i.product_id === p.id)).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24">
            <Input type="number" step="0.01" value={addQty} onChange={(e) => setAddQty(Number(e.target.value))} placeholder="Qtd" />
          </div>
          <Button type="button" variant="outline" onClick={addItem}><Plus className="size-4" /></Button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-2">Nenhum produto vinculado.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((i) => {
              const p = products.find((x: any) => x.id === i.product_id);
              return (
                <div key={i.product_id} className="flex items-center gap-2 p-2 rounded-md bg-page-bg/60 border border-border/40">
                  <span className="flex-1 text-sm">{p?.name || i.product_id}</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={i.quantity}
                    onChange={(e) => setItems(items.map((it) => it.product_id === i.product_id ? { ...it, quantity: Number(e.target.value) } : it))}
                    className="w-20 h-8"
                  />
                  <span className="text-xs text-text-muted">{p?.unit}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((it) => it.product_id !== i.product_id))} className="h-7 w-7 p-0 text-danger">
                    <X className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
      <div className="col-span-2 flex justify-end gap-2 mt-2">
        <Button type="submit" disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

function ProfessionalManager({ professionals, onDel }: { professionals: any[]; onDel: (p: any) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", specialty: "", phone: "", email: "", active: true });
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const { error } = await supabase.from("professionals").insert({
      name: form.name,
      specialty: form.specialty || null,
      phone: form.phone || null,
      email: form.email || null,
      active: form.active,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profissional cadastrado");
    setForm({ name: "", specialty: "", phone: "", email: "", active: true });
    qc.invalidateQueries({ queryKey: ["professionals"] });
  }

  async function toggleActive(p: any) {
    const { error } = await supabase.from("professionals").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["professionals"] });
  }

  const getAuthUrl = useServerFn(getGoogleAuthUrl);
  const disconnect = useServerFn(disconnectGoogle);

  async function connectGoogle(p: any) {
    try {
      const { url } = await getAuthUrl({ data: { professional_id: p.id, origin: window.location.origin } });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar conexão com Google");
    }
  }

  async function disconnectGoogleFn(p: any) {
    if (!confirm(`Desconectar Google Agenda de "${p.name}"?`)) return;
    try {
      await disconnect({ data: { professional_id: p.id } });
      toast.success("Google desconectado");
      qc.invalidateQueries({ queryKey: ["professionals"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid grid-cols-2 gap-2 p-3 rounded-md border border-border/60">
        <div className="col-span-2 space-y-1"><Label className="text-xs">Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} required /></div>
        <div className="space-y-1"><Label className="text-xs">Especialidade</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} maxLength={100} /></div>
        <div className="space-y-1"><Label className="text-xs">Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} /></div>
        <div className="col-span-2 space-y-1"><Label className="text-xs">E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={150} /></div>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" size="sm" disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
            <Plus className="size-4 mr-1" /> {saving ? "Salvando..." : "Cadastrar"}
          </Button>
        </div>
      </form>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {professionals.length === 0 && <p className="text-sm text-text-muted text-center py-4">Nenhum profissional cadastrado.</p>}
        {professionals.map((p: any) => (
          <div key={p.id} className="p-2 rounded-md bg-page-bg/60 border border-border/40 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-[11px] text-text-muted truncate">
                  {[p.specialty, p.phone, p.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <Badge variant="secondary" className={p.active ? "bg-emerald-500/15 text-emerald-700" : ""}>
                {p.active ? "Ativo" : "Inativo"}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => toggleActive(p)} className="h-7 text-xs">
                {p.active ? "Desativar" : "Ativar"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDel(p)} className="text-danger hover:text-danger h-7 w-7 p-0">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border/40">
              <CalendarIcon className="size-3.5 text-text-muted" />
              {p.google_refresh_token ? (
                <>
                  <span className="text-[11px] text-emerald-700 truncate flex-1">
                    Google conectado{p.google_email ? ` · ${p.google_email}` : ""}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => disconnectGoogleFn(p)} className="h-7 text-[11px]">
                    Desconectar
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-[11px] text-text-muted flex-1">Google Agenda não conectado</span>
                  <Button variant="outline" size="sm" onClick={() => connectGoogle(p)} className="h-7 text-[11px]">
                    Conectar Google
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
