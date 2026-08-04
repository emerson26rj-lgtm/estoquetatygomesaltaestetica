import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "@/components/signature-pad";
import { FileSignature, Trash2, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Consentimento — Taty Gomes Alta Estética" },
      { name: "description", content: "Modelos de termo de consentimento por procedimento e assinatura digital das clientes." },
      { property: "og:title", content: "Termos de Consentimento — Taty Gomes Alta Estética" },
      { property: "og:description", content: "Gere, assine e arquive termos de consentimento das clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermosPage,
});

const MODELO_PADRAO = `Declaro que fui devidamente informada sobre o procedimento estético indicado, seus objetivos, a técnica utilizada, os cuidados pré e pós-procedimento, os resultados esperados, bem como sobre a possibilidade de reações adversas (vermelhidão, edema, hematomas, sensibilidade, alterações de pigmentação, entre outras).

Informei corretamente meus dados de saúde na ficha de anamnese, incluindo alergias, uso de medicamentos, gestação/amamentação e procedimentos anteriores.

Estou ciente de que os resultados podem variar conforme a resposta individual do organismo e que podem ser necessárias sessões complementares.

Autorizo a realização do procedimento e o registro fotográfico para acompanhamento clínico.`;

function ptDate(v?: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}

function TermosPage() {
  const qc = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ["consent_templates"],
    queryFn: async () =>
      (await (supabase as any).from("consent_templates").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome,cpf").order("nome")).data ?? [],
  });
  const { data: services = [] } = useQuery({
    queryKey: ["services-min"],
    queryFn: async () => (await supabase.from("services").select("id,name").eq("active", true).order("name")).data ?? [],
  });
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals-min"],
    queryFn: async () => (await supabase.from("professionals").select("id,name").eq("active", true).order("name")).data ?? [],
  });
  const { data: consents = [] } = useQuery({
    queryKey: ["consents"],
    queryFn: async () =>
      (await (supabase as any)
        .from("consents")
        .select("*, clientes(nome,cpf), services(name), professionals(name)")
        .order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Termos de Consentimento</h1>
        <p className="text-sm text-muted-foreground">Modelos por procedimento, assinatura digital da cliente e arquivo em PDF.</p>
      </header>

      <Tabs defaultValue="assinados">
        <TabsList>
          <TabsTrigger value="assinados">Termos</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
        </TabsList>

        <TabsContent value="assinados" className="space-y-4 pt-4">
          <NovoTermo templates={templates} clientes={clientes} services={services} professionals={professionals} qc={qc} />
          <ConsentList consents={consents} qc={qc} />
        </TabsContent>

        <TabsContent value="modelos" className="space-y-4 pt-4">
          <TemplateManager templates={templates} services={services} qc={qc} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateManager({ templates, services, qc }: any) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(MODELO_PADRAO);
  const [serviceId, setServiceId] = useState("none");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !body.trim()) return toast.error("Preencha título e texto");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("consent_templates").insert({
      title: title.trim(),
      body: body.trim(),
      service_id: serviceId === "none" ? null : serviceId,
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Modelo salvo");
    setOpen(false);
    setTitle("");
    setBody(MODELO_PADRAO);
    setServiceId("none");
    qc.invalidateQueries({ queryKey: ["consent_templates"] });
  }

  async function remove(id: string) {
    const { error } = await (supabase as any).from("consent_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Modelo excluído");
    qc.invalidateQueries({ queryKey: ["consent_templates"] });
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Modelos de termo</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-4 mr-1" /> Novo modelo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo modelo de termo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Termo de consentimento — Toxina botulínica" />
              </div>
              <div className="space-y-1.5">
                <Label>Procedimento vinculado (opcional)</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Texto do termo</Label>
                <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar modelo"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado ainda.</p>}
      <div className="space-y-2">
        {templates.map((t: any) => (
          <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">{t.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NovoTermo({ templates, clientes, services, professionals, qc }: any) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [templateId, setTemplateId] = useState("none");
  const [serviceId, setServiceId] = useState("none");
  const [professionalId, setProfessionalId] = useState("none");
  const [title, setTitle] = useState("Termo de Consentimento Livre e Esclarecido");
  const [body, setBody] = useState(MODELO_PADRAO);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x: any) => x.id === id);
    if (t) {
      setTitle(t.title);
      setBody(t.body);
      if (t.service_id) setServiceId(t.service_id);
    }
  }

  async function save() {
    if (!clienteId) return toast.error("Selecione a cliente");
    if (!signature) return toast.error("A cliente precisa assinar");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("consents").insert({
      cliente_id: clienteId,
      template_id: templateId === "none" ? null : templateId,
      service_id: serviceId === "none" ? null : serviceId,
      professional_id: professionalId === "none" ? null : professionalId,
      title,
      body,
      notes: notes || null,
      signature,
      signed_at: new Date().toISOString(),
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Termo assinado e arquivado");
    setOpen(false);
    setSignature(null);
    setNotes("");
    setClienteId("");
    qc.invalidateQueries({ queryKey: ["consents"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><FileSignature className="size-4 mr-1" /> Novo termo assinado</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Termo de consentimento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue placeholder="Texto livre" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Texto livre</SelectItem>
                  {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Procedimento</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {professionals.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Texto do termo</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Assinatura da cliente</Label>
            <SignaturePad value={signature ?? undefined} onChange={setSignature} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Assinar e arquivar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentList({ consents, qc }: any) {
  const [filtro, setFiltro] = useState("");
  const list = useMemo(
    () =>
      consents.filter((c: any) =>
        `${c.clientes?.nome ?? ""} ${c.title}`.toLowerCase().includes(filtro.toLowerCase()),
      ),
    [consents, filtro],
  );

  async function remove(id: string) {
    const { error } = await (supabase as any).from("consents").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Termo removido");
    qc.invalidateQueries({ queryKey: ["consents"] });
  }

  function pdf(c: any) {
    const doc = new jsPDF();
    const margin = 16;
    let y = 20;
    doc.setFontSize(14);
    doc.text("Taty Gomes Alta Estética", margin, y);
    y += 8;
    doc.setFontSize(12);
    doc.text(c.title, margin, y, { maxWidth: 180 });
    y += 10;
    doc.setFontSize(10);
    doc.text(`Cliente: ${c.clientes?.nome ?? "—"}${c.clientes?.cpf ? `  •  CPF: ${c.clientes.cpf}` : ""}`, margin, y);
    y += 6;
    doc.text(`Procedimento: ${c.services?.name ?? "—"}  •  Profissional: ${c.professionals?.name ?? "—"}`, margin, y);
    y += 6;
    doc.text(`Assinado em: ${ptDate(c.signed_at)}`, margin, y);
    y += 10;

    const lines = doc.splitTextToSize(c.body, 180);
    for (const line of lines) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5.5;
    }

    if (c.notes) {
      y += 6;
      doc.text("Observações:", margin, y);
      y += 5.5;
      for (const line of doc.splitTextToSize(c.notes, 180)) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5.5;
      }
    }

    if (c.signature) {
      if (y > 210) { doc.addPage(); y = 20; }
      y += 12;
      try { doc.addImage(c.signature, "PNG", margin, y, 70, 26); } catch { /* assinatura inválida */ }
      y += 30;
      doc.line(margin, y, margin + 70, y);
      y += 5;
      doc.text("Assinatura da cliente", margin, y);
    }

    doc.save(`termo-${(c.clientes?.nome ?? "cliente").replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Termos assinados</h2>
        <Input className="max-w-xs" placeholder="Buscar por cliente ou título" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum termo registrado.</p>}
      <div className="space-y-2">
        {list.map((c: any) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">{c.clientes?.nome ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {c.services?.name ? `${c.services.name} • ` : ""}{ptDate(c.signed_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {c.signature ? <Badge variant="secondary">Assinado</Badge> : <Badge variant="outline">Sem assinatura</Badge>}
              <Button variant="outline" size="sm" onClick={() => pdf(c)}><Download className="size-4 mr-1" /> PDF</Button>
              <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
