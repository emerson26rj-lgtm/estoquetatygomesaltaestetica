import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { z } from "zod";
import { SignaturePad } from "@/components/signature-pad";

const searchSchema = z.object({ cliente: z.string().optional() });

export const Route = createFileRoute("/_authenticated/anamnese")({
  head: () => ({ meta: [{ title: "Ficha de Anamnese — Taty Gomes Alta Estética Gestão" }] }),
  validateSearch: searchSchema,
  component: AnamnesePage,
});

type Anamnese = {
  id?: string;
  cliente_id: string;
  data_atendimento?: string;
  queixa_principal?: string;
  historico_saude?: string;
  alergias?: string;
  medicamentos?: string;
  cirurgias_previas?: string;
  gestante?: boolean;
  fumante?: boolean;
  hipertensao?: boolean;
  diabetes?: boolean;
  procedimentos_esteticos_previos?: string;
  contraindicacoes?: string;
  procedimento_realizado?: string;
  produtos_utilizados?: string;
  observacoes?: string;
  assinatura_cliente?: string;
  assinatura_data?: string | null;
  peso?: number | string;
  altura?: number | string;
  medidas?: string;
};

function AnamnesePage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [clienteId, setClienteId] = useState<string>(search.cliente ?? "");
  const [editing, setEditing] = useState<Anamnese | null>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome").order("nome")).data ?? [],
  });

  const { data: fichas = [] } = useQuery({
    queryKey: ["anamneses", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data } = await supabase.from("anamneses").select("*").eq("cliente_id", clienteId).order("data_atendimento", { ascending: false });
      return data ?? [];
    },
    enabled: !!clienteId,
  });

  function novo() {
    if (!clienteId) return toast.error("Selecione um cliente");
    setEditing({ cliente_id: clienteId, data_atendimento: new Date().toISOString().slice(0, 10) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload: any = { ...editing };
    if (payload.assinatura_cliente && !payload.assinatura_data) {
      payload.assinatura_data = new Date().toISOString();
    }
    if (editing.id) {
      const { error } = await supabase.from("anamneses").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Ficha atualizada");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("anamneses").insert({ ...payload, created_by: u.user?.id });
      if (error) return toast.error(error.message);
      toast.success("Ficha criada");
    }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["anamneses", clienteId] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta ficha?")) return;
    const { error } = await supabase.from("anamneses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ficha excluída");
    qc.invalidateQueries({ queryKey: ["anamneses", clienteId] });
  }

  if (editing) {
    return (
      <div className="space-y-6 max-w-3xl print:max-w-none">
        <header className="flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ArrowLeft className="size-4" /></Button>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-muted">Anamnese</p>
              <h1 className="text-2xl font-semibold tracking-tight">{editing.id ? "Editar ficha" : "Nova ficha"}</h1>
            </div>
          </div>
          {editing.id && (
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4 mr-1.5" /> Imprimir
            </Button>
          )}
        </header>
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-semibold">Taty Gomes Alta Estética — Ficha de Anamnese</h1>
          <p className="text-sm text-text-muted">Cliente: {clientes.find((c: any) => c.id === editing.cliente_id)?.nome ?? ""} • Data: {editing.data_atendimento ? new Date(editing.data_atendimento).toLocaleDateString("pt-BR") : ""}</p>
        </div>

        <form onSubmit={save} className="space-y-6">
          <Card className="p-5 space-y-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <h2 className="text-sm font-semibold">Atendimento</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Data do atendimento</Label>
                <Input type="date" value={editing.data_atendimento ?? ""} onChange={(e) => setEditing({ ...editing, data_atendimento: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Queixa principal</Label>
              <Textarea rows={2} value={editing.queixa_principal ?? ""} onChange={(e) => setEditing({ ...editing, queixa_principal: e.target.value })} />
            </div>
          </Card>

          <Card className="p-5 space-y-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <h2 className="text-sm font-semibold">Medidas corporais</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Peso (kg)</Label>
                <Input type="number" step="0.01" min="0" value={editing.peso ?? ""} onChange={(e) => setEditing({ ...editing, peso: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Altura (m)</Label>
                <Input type="number" step="0.01" min="0" value={editing.altura ?? ""} onChange={(e) => setEditing({ ...editing, altura: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>IMC</Label>
                <Input readOnly value={(() => {
                  const p = parseFloat(editing.peso as any);
                  const a = parseFloat(editing.altura as any);
                  if (!p || !a || a === 0) return "";
                  return (p / (a * a)).toFixed(1);
                })()} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Medidas (cintura, quadril, etc.)</Label>
              <Textarea rows={2} value={editing.medidas ?? ""} onChange={(e) => setEditing({ ...editing, medidas: e.target.value })} />
            </div>
          </Card>

          <Card className="p-5 space-y-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <h2 className="text-sm font-semibold">Histórico de saúde</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={editing.gestante} onCheckedChange={(v) => setEditing({ ...editing, gestante: !!v })} /> Gestante</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={editing.fumante} onCheckedChange={(v) => setEditing({ ...editing, fumante: !!v })} /> Fumante</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={editing.hipertensao} onCheckedChange={(v) => setEditing({ ...editing, hipertensao: !!v })} /> Hipertensão</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={editing.diabetes} onCheckedChange={(v) => setEditing({ ...editing, diabetes: !!v })} /> Diabetes</label>
            </div>
            <div className="space-y-1.5"><Label>Histórico geral de saúde</Label><Textarea rows={2} value={editing.historico_saude ?? ""} onChange={(e) => setEditing({ ...editing, historico_saude: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Alergias</Label><Textarea rows={2} value={editing.alergias ?? ""} onChange={(e) => setEditing({ ...editing, alergias: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Medicamentos em uso</Label><Textarea rows={2} value={editing.medicamentos ?? ""} onChange={(e) => setEditing({ ...editing, medicamentos: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cirurgias prévias</Label><Textarea rows={2} value={editing.cirurgias_previas ?? ""} onChange={(e) => setEditing({ ...editing, cirurgias_previas: e.target.value })} /></div>
          </Card>

          <Card className="p-5 space-y-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
            <h2 className="text-sm font-semibold">Estética</h2>
            <div className="space-y-1.5"><Label>Procedimentos estéticos prévios</Label><Textarea rows={2} value={editing.procedimentos_esteticos_previos ?? ""} onChange={(e) => setEditing({ ...editing, procedimentos_esteticos_previos: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Contraindicações identificadas</Label><Textarea rows={2} value={editing.contraindicacoes ?? ""} onChange={(e) => setEditing({ ...editing, contraindicacoes: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Procedimento realizado hoje</Label><Textarea rows={2} value={editing.procedimento_realizado ?? ""} onChange={(e) => setEditing({ ...editing, procedimento_realizado: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Produtos utilizados</Label><Textarea rows={2} value={editing.produtos_utilizados ?? ""} onChange={(e) => setEditing({ ...editing, produtos_utilizados: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Assinatura do cliente</Label>
              <SignaturePad value={editing.assinatura_cliente} onChange={(v) => setEditing({ ...editing, assinatura_cliente: v ?? undefined, assinatura_data: v ? new Date().toISOString() : null })} />
              {editing.assinatura_data && <p className="text-[11px] text-text-muted">Assinado em {new Date(editing.assinatura_data).toLocaleString("pt-BR")}</p>}
            </div>
          </Card>

          <div className="flex justify-end gap-2 print:hidden">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" className="bg-brand-primary hover:bg-brand-primary/90 text-white">Salvar ficha</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Prontuário</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Ficha de Anamnese</h1>
          <p className="text-sm text-text-muted mt-1">Selecione um cliente para visualizar ou criar fichas.</p>
        </div>
        <Button asChild variant="outline"><Link to="/clientes">Gerenciar clientes</Link></Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 min-w-[280px]">
          <Label>Cliente</Label>
          <Select value={clienteId} onValueChange={setClienteId}>
            <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={novo} disabled={!clienteId} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          <Plus className="size-4 mr-1.5" /> Nova ficha
        </Button>
      </div>

      {clienteId && (
        <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                  <th className="p-3 font-medium">Data</th>
                  <th className="p-3 font-medium">Queixa</th>
                  <th className="p-3 font-medium">Procedimento</th>
                  <th className="p-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fichas.map((f: any) => (
                  <tr key={f.id} className="border-b border-border/40 hover:bg-page-bg/60">
                    <td className="p-3">{f.data_atendimento ? new Date(f.data_atendimento).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-3 text-text-muted truncate max-w-[240px]">{f.queixa_principal ?? "—"}</td>
                    <td className="p-3 text-text-muted truncate max-w-[240px]">{f.procedimento_realizado ?? "—"}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(f)}>Abrir</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(f.id)}><Trash2 className="size-3.5 text-danger" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {fichas.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-text-muted">Nenhuma ficha cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
