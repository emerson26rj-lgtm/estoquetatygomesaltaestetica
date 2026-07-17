import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Send, Plus, Trash2, MessageSquare } from "lucide-react";
import { statusOf } from "@/lib/stock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ia")({
  head: () => ({ meta: [{ title: "Assistente IA — Taty Gomes Alta Estética Gestão" }] }),
  component: IaPage,
});

const suggestions = [
  "Quais produtos precisam ser comprados esta semana?",
  "Quais itens vencem nos próximos 30 dias?",
  "Qual o valor total do estoque atual?",
  "Gere um resumo gerencial do estoque.",
];

type Msg = { role: "user" | "assistant"; content: string };
type Thread = { id: string; title: string; updated_at: string };

function IaPage() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name), suppliers(name)").order("name")).data ?? [],
  });

  const { data: threads = [] } = useQuery<Thread[]>({
    queryKey: ["chat_threads"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("chat_threads").select("id,title,updated_at").order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // pick active thread when list loads
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) setActiveThreadId(threads[0].id);
  }, [threads, activeThreadId]);

  // load messages for active thread
  useEffect(() => {
    (async () => {
      if (!activeThreadId) { setMessages([]); return; }
      const { data } = await (supabase as any)
        .from("chat_messages")
        .select("role,content")
        .eq("thread_id", activeThreadId)
        .order("created_at");
      setMessages((data ?? []) as Msg[]);
    })();
  }, [activeThreadId]);

  useEffect(() => { inputRef.current?.focus(); }, [activeThreadId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const context = {
    total_produtos: products.length,
    produtos: (products as any[]).map((p) => ({
      nome: p.name,
      categoria: p.categories?.name,
      fornecedor: p.suppliers?.name,
      lote: p.batch,
      validade: p.expiry_date,
      quantidade: Number(p.quantity),
      minimo: Number(p.min_stock),
      custo: Number(p.cost_value),
      status: statusOf(p.quantity, p.min_stock, p.expiry_date),
    })),
  };

  async function ensureThread(firstMessage: string): Promise<string | null> {
    if (activeThreadId) return activeThreadId;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    const title = firstMessage.slice(0, 60);
    const { data, error } = await (supabase as any)
      .from("chat_threads")
      .insert({ user_id: userData.user.id, title })
      .select("id")
      .single();
    if (error || !data) { toast.error("Erro ao criar conversa"); return null; }
    setActiveThreadId(data.id);
    qc.invalidateQueries({ queryKey: ["chat_threads"] });
    return data.id as string;
  }

  async function persist(threadId: string, role: "user" | "assistant", content: string) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await (supabase as any).from("chat_messages").insert({
      thread_id: threadId, user_id: userData.user.id, role, content,
    });
    await (supabase as any).from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const threadId = await ensureThread(content);
    if (!threadId) return;

    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    void persist(threadId, "user", content);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const reply = json.reply as string;
      setMessages([...next, { role: "assistant", content: reply }]);
      void persist(threadId, "assistant", reply);
      qc.invalidateQueries({ queryKey: ["chat_threads"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro na IA");
      setMessages(next);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function newThread() {
    setActiveThreadId(null);
    setMessages([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function deleteThread(id: string) {
    if (!confirm("Excluir esta conversa?")) return;
    await (supabase as any).from("chat_threads").delete().eq("id", id);
    if (activeThreadId === id) { setActiveThreadId(null); setMessages([]); }
    qc.invalidateQueries({ queryKey: ["chat_threads"] });
  }

  const showEmpty = messages.length === 0 && !loading;

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">IA integrada</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
            <Sparkles className="size-5 text-brand-primary" /> Assistente Inteligente
          </h1>
        </div>
        <Button onClick={newThread} size="sm" className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          <Plus className="size-4 mr-1" /> Nova conversa
        </Button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 overflow-hidden">
        {/* Threads sidebar */}
        <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 text-[11px] uppercase tracking-wider text-text-muted">Histórico</div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {threads.length === 0 && (
              <p className="text-xs text-text-muted p-3">Nenhuma conversa ainda.</p>
            )}
            {threads.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer",
                  activeThreadId === t.id ? "bg-brand-primary/10 text-brand-primary" : "hover:bg-page-bg"
                )}
                onClick={() => setActiveThreadId(t.id)}
              >
                <MessageSquare className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{t.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500"
                  aria-label="Excluir"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Chat */}
        <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {showEmpty && (
              <div className="text-sm text-text-muted p-4">
                Olá! Sou o assistente da Taty Gomes Alta Estética. Pergunte sobre estoque, validade, reposição e tendências de consumo.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user" ? "bg-brand-primary text-white" : "bg-page-bg text-text-main ring-1 ring-black/5"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-page-bg text-text-muted rounded-2xl px-4 py-2.5 text-sm ring-1 ring-black/5">
                  Analisando estoque...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {showEmpty && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20 hover:bg-brand-primary/15">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-border/60 p-3 flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Pergunte sobre o estoque..."
              className="min-h-[44px] max-h-32 resize-none"
              maxLength={1000}
            />
            <Button onClick={() => send()} disabled={loading || !input.trim()} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <Send className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
