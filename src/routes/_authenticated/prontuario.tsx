import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, Camera } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/prontuario")({
  head: () => ({ meta: [{ title: "Prontuário Fotográfico — Taty Gomes Alta Estética Gestão" }] }),
  component: ProntuarioPage,
});

function ProntuarioPage() {
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState<string>("");
  const [phase, setPhase] = useState<"before" | "after" | "progress">("before");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome").order("nome")).data ?? [],
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["client_photos", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data } = await supabase.from("client_photos").select("*").eq("cliente_id", clienteId).order("taken_at", { ascending: false });
      const withUrls = await Promise.all((data ?? []).map(async (p: any) => {
        const { data: signed } = await supabase.storage.from("prontuario").createSignedUrl(p.storage_path, 3600);
        return { ...p, url: signed?.signedUrl };
      }));
      return withUrls;
    },
    enabled: !!clienteId,
  });

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!clienteId) return toast.error("Selecione um cliente");
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${clienteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("prontuario").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("client_photos").insert({
          cliente_id: clienteId,
          storage_path: path,
          phase,
          caption: caption || null,
          taken_at: new Date().toISOString().slice(0, 10),
          created_by: u.user?.id,
        });
        if (insErr) throw insErr;
      }
      toast.success("Fotos enviadas");
      setCaption("");
      e.target.value = "";
      qc.invalidateQueries({ queryKey: ["client_photos", clienteId] });
    } catch (err: any) {
      toast.error(err.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
  }

  async function remove(p: any) {
    if (!confirm("Excluir esta foto?")) return;
    await supabase.storage.from("prontuario").remove([p.storage_path]);
    await supabase.from("client_photos").delete().eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["client_photos", clienteId] });
  }

  const grouped = {
    before: photos.filter((p: any) => p.phase === "before"),
    progress: photos.filter((p: any) => p.phase === "progress"),
    after: photos.filter((p: any) => p.phase === "after"),
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Prontuário</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Fotos antes e depois</h1>
        <p className="text-sm text-text-muted mt-1">Armazenamento privado — apenas usuários autenticados podem visualizar.</p>
      </header>

      <Card className="p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
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
            <Label>Fase</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Antes</SelectItem>
                <SelectItem value="progress">Evolução</SelectItem>
                <SelectItem value="after">Depois</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Legenda (opcional)</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ex: sessão 3 — dia 15" />
          </div>
        </div>
        <div>
          <Label>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-primary text-white text-sm font-medium cursor-pointer hover:bg-brand-primary/90">
              <Upload className="size-4" /> {uploading ? "Enviando..." : "Enviar fotos"}
            </div>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} disabled={uploading || !clienteId} />
          </Label>
        </div>
      </Card>

      {clienteId && (
        <div className="space-y-6">
          {(["before", "progress", "after"] as const).map((k) => (
            <section key={k} className="space-y-3">
              <h2 className="text-sm font-semibold">
                {k === "before" ? "Antes" : k === "progress" ? "Evolução" : "Depois"}
                <span className="ml-2 text-text-muted font-normal">({grouped[k].length})</span>
              </h2>
              {grouped[k].length === 0 && (
                <Card className="p-6 text-center text-sm text-text-muted bg-surface ring-1 ring-black/5 border-0 shadow-none">Nenhuma foto nesta fase.</Card>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {grouped[k].map((p: any) => (
                  <Card key={p.id} className="overflow-hidden bg-surface ring-1 ring-black/5 border-0 shadow-none group relative">
                    {p.url ? (
                      <img src={p.url} alt={p.caption ?? ""} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 flex items-center justify-center bg-page-bg"><Camera className="size-6 text-text-muted" /></div>
                    )}
                    <div className="p-2 space-y-1">
                      <p className="text-[11px] text-text-muted">{p.taken_at ? new Date(p.taken_at).toLocaleDateString("pt-BR") : ""}</p>
                      {p.caption && <p className="text-xs truncate">{p.caption}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-7 w-7 p-0 bg-white/80 opacity-0 group-hover:opacity-100" onClick={() => remove(p)}>
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
