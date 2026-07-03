import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Send } from "lucide-react";
import { statusOf } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/ia")({
  head: () => ({ meta: [{ title: "Assistente IA — Dermasul Gestão" }] }),
  component: IaPage,
});

const suggestions = [
  "Quais produtos precisam ser comprados esta semana?",
  "Quais itens vencem nos próximos 30 dias?",
  "Qual o valor total do estoque atual?",
  "Gere um resumo gerencial do estoque.",
];

type Msg = { role: "user" | "assistant"; content: string };

function IaPage() {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name), suppliers(name)").order("name")).data ?? [],
  });

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Olá! Sou o assistente da Dermasul. Pergunte sobre estoque, validade, reposição e tendências de consumo." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
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

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessages([...next, { role: "assistant", content: json.reply }]);
    } catch (e: any) {
      toast.error(e.message ?? "Erro na IA");
      setMessages(next);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">IA integrada</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
          <Sparkles className="size-5 text-brand-primary" /> Assistente Inteligente
        </h1>
      </header>

      <Card className="flex-1 bg-surface ring-1 ring-black/5 border-0 shadow-none flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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

        {messages.length <= 2 && (
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
  );
}
