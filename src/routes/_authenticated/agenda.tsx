import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight, Trash2, Calendar as CalendarIcon, AlertCircle } from "lucide-react";
import { upsertAppointment, deleteAppointment } from "@/lib/appointments.functions";
import { currency } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Taty Gomes Alta Estética Gestão" }] }),
  component: AgendaPage,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Agendado", cls: "bg-blue-500/15 text-blue-700" },
  confirmed: { label: "Confirmado", cls: "bg-violet-500/15 text-violet-700" },
  completed: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-700" },
  canceled: { label: "Cancelado", cls: "bg-rose-500/15 text-rose-700" },
  no_show: { label: "Faltou", cls: "bg-amber-500/15 text-amber-700" },
};

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day;
  const nd = new Date(d);
  nd.setDate(diff);
  nd.setHours(0, 0, 0, 0);
  return nd;
}
function addDays(d: Date, n: number) { const nd = new Date(d); nd.setDate(d.getDate() + n); return nd; }
function fmtDate(d: Date) { return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
function fmtWeekday(d: Date) { return d.toLocaleDateString("pt-BR", { weekday: "short" }); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function toInputLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function AgendaPage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [profFilter, setProfFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [defaultStart, setDefaultStart] = useState<Date | null>(null);

  const weekEnd = addDays(weekStart, 7);

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, services(name), professionals(id, name, google_refresh_token), clientes(nome)")
        .gte("starts_at", weekStart.toISOString())
        .lt("starts_at", weekEnd.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => (await supabase.from("professionals").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: services = [] } = useQuery({
    queryKey: ["services-active"],
    queryFn: async () => (await supabase.from("services").select("id, name, price, duration_minutes, professional_ref_id").eq("active", true).order("name")).data ?? [],
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-list"],
    queryFn: async () => (await supabase.from("clientes").select("id, nome").order("nome")).data ?? [],
  });

  const filtered = useMemo(
    () => appointments.filter((a: any) => profFilter === "all" || a.professional_id === profFilter),
    [appointments, profFilter],
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = days.map((d) => filtered.filter((a: any) => {
    const s = new Date(a.starts_at);
    return s.toDateString() === d.toDateString();
  }));

  const del = useServerFn(deleteAppointment);
  async function handleDelete(id: string) {
    if (!confirm("Excluir este agendamento? Também removerá do Google Agenda se sincronizado.")) return;
    try {
      await del({ data: { id } });
      toast.success("Agendamento excluído");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Operação</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Agenda</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="size-4" /></Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setDefaultStart(null); } }}>
            <DialogTrigger asChild>
              <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white"><Plus className="size-4 mr-1" /> Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle></DialogHeader>
              <AppointmentForm
                initial={editing}
                defaultStart={defaultStart}
                professionals={professionals as any}
                services={services as any}
                clientes={clientes as any}
                onSaved={() => { setOpen(false); setEditing(null); setDefaultStart(null); qc.invalidateQueries({ queryKey: ["appointments"] }); }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">
          Semana de {fmtDate(weekStart)} a {fmtDate(addDays(weekStart, 6))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-text-muted">Profissional:</Label>
          <Select value={profFilter} onValueChange={setProfFilter}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {professionals.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d, i) => {
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <Card key={i} className={`bg-surface ring-1 ${isToday ? "ring-brand-primary/40" : "ring-black/5"} border-0 shadow-none p-3 min-h-[180px]`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted">{fmtWeekday(d)}</p>
                  <p className={`text-lg font-semibold ${isToday ? "text-brand-primary" : ""}`}>{d.getDate()}</p>
                </div>
                <Button
                  variant="ghost" size="sm" className="h-6 w-6 p-0"
                  onClick={() => {
                    const start = new Date(d); start.setHours(9, 0, 0, 0);
                    setDefaultStart(start); setEditing(null); setOpen(true);
                  }}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="space-y-1.5">
                {byDay[i].length === 0 && <p className="text-[11px] text-text-muted italic">Sem agendamentos</p>}
                {byDay[i].map((a: any) => {
                  const st = STATUS[a.status] ?? STATUS.scheduled;
                  return (
                    <button
                      key={a.id}
                      onClick={() => { setEditing(a); setDefaultStart(null); setOpen(true); }}
                      className="w-full text-left p-2 rounded-md bg-page-bg/70 hover:bg-page-bg border border-border/40 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}</span>
                        <Badge variant="secondary" className={`text-[10px] h-4 px-1.5 ${st.cls}`}>{st.label}</Badge>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">{a.services?.name || "Atendimento"}</p>
                      <p className="text-[11px] text-text-muted truncate">
                        {a.client_name || a.clientes?.nome || "—"} · {a.professionals?.name}
                      </p>
                      {a.google_event_id && <p className="text-[10px] text-emerald-600 mt-0.5">✓ Google</p>}
                      {a.google_sync_error && <p className="text-[10px] text-danger mt-0.5 flex items-center gap-1"><AlertCircle className="size-2.5" /> Erro sync</p>}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => handleDelete(editing.id)} className="text-danger">
            <Trash2 className="size-3.5 mr-1" /> Excluir agendamento aberto
          </Button>
        </div>
      )}

      <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
        <div className="flex items-start gap-3">
          <CalendarIcon className="size-4 text-brand-primary mt-0.5 shrink-0" />
          <div className="text-xs text-text-muted space-y-1">
            <p><strong className="text-foreground">Google Agenda:</strong> conecte a conta Google de cada profissional na tela de Serviços → Profissionais. Depois disso, todo agendamento criado, editado ou cancelado aparece automaticamente na agenda do profissional.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AppointmentForm({ initial, defaultStart, professionals, services, clientes, onSaved }: {
  initial: any; defaultStart: Date | null;
  professionals: any[]; services: any[]; clientes: any[];
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertAppointment);
  const [form, setForm] = useState(() => {
    const s = initial ? new Date(initial.starts_at) : (defaultStart ?? new Date());
    const e = initial ? new Date(initial.ends_at) : new Date(s.getTime() + 60 * 60000);
    return {
      professional_id: initial?.professional_id ?? "",
      service_id: initial?.service_id ?? "",
      client_id: initial?.client_id ?? "",
      client_name: initial?.client_name ?? "",
      starts_at: toInputLocal(s),
      ends_at: toInputLocal(e),
      status: initial?.status ?? "scheduled",
      price: initial?.price ?? "",
      notes: initial?.notes ?? "",
    };
  });
  const [saving, setSaving] = useState(false);

  function onServiceChange(id: string) {
    const svc = services.find((s: any) => s.id === id);
    setForm((f) => {
      const next = { ...f, service_id: id };
      if (svc?.price != null && !f.price) next.price = svc.price;
      if (svc?.professional_ref_id && !f.professional_id) next.professional_id = svc.professional_ref_id;
      if (svc?.duration_minutes && f.starts_at) {
        const s = new Date(f.starts_at);
        const e = new Date(s.getTime() + Number(svc.duration_minutes) * 60000);
        next.ends_at = toInputLocal(e);
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.professional_id) return toast.error("Selecione o profissional");
    if (!form.starts_at || !form.ends_at) return toast.error("Informe início e fim");
    if (!form.client_id && !form.client_name.trim()) return toast.error("Selecione ou informe o nome do cliente");
    setSaving(true);
    try {
      await upsert({
        data: {
          id: initial?.id,
          professional_id: form.professional_id,
          service_id: form.service_id || null,
          client_id: form.client_id || null,
          client_name: form.client_name || null,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          status: form.status as any,
          price: form.price === "" ? null : Number(form.price),
          notes: form.notes || null,
        },
      });
      toast.success(initial ? "Agendamento atualizado" : "Agendamento criado");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const prof = professionals.find((p: any) => p.id === form.professional_id);

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Profissional</Label>
        <Select value={form.professional_id || undefined} onValueChange={(v) => setForm({ ...form, professional_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>
            {professionals.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.google_refresh_token ? " · 📅" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {prof && !prof.google_refresh_token && (
          <p className="text-[10px] text-amber-600">Sem Google Agenda conectado</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Serviço</Label>
        <Select value={form.service_id || undefined} onValueChange={onServiceChange}>
          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} · {currency(Number(s.price))}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Cliente cadastrado</Label>
        <Select value={form.client_id || undefined} onValueChange={(v) => setForm({ ...form, client_id: v, client_name: "" })}>
          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>{clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>ou Nome avulso</Label>
        <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value, client_id: "" })} placeholder="Cliente sem cadastro" />
      </div>
      <div className="space-y-1.5">
        <Label>Início</Label>
        <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
      </div>
      <div className="space-y-1.5">
        <Label>Fim</Label>
        <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} required />
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Preço (R$)</Label>
        <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value as any })} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label>Observações</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} />
      </div>
      {initial?.google_sync_error && (
        <div className="col-span-2 text-xs text-danger p-2 rounded-md bg-danger/10 border border-danger/20">
          <strong>Erro na sincronização com Google:</strong> {initial.google_sync_error}
        </div>
      )}
      <div className="col-span-2 flex justify-end gap-2 mt-2">
        <Button type="submit" disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
