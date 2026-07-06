import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { messages: Array<{ role: string; content: string }>; context?: any };
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const systemPrompt = `Você é o assistente inteligente da Taty Gomes Alta Estética Gestão, um sistema de estoque de clínica de estética.
Responda em português brasileiro, de forma objetiva e profissional.
Use os dados abaixo (JSON) como contexto atual do estoque para responder perguntas sobre validade, baixo estoque, sugestões de reposição, valor do estoque, tendências e relatórios gerenciais.
Quando sugerir compras, priorize itens com estoque abaixo do mínimo ou próximos ao vencimento (30 dias).

CONTEXTO ATUAL:
${JSON.stringify(body.context ?? {}, null, 2)}`;

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: systemPrompt },
                ...body.messages,
              ],
            }),
          });

          if (res.status === 429) {
            return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), { status: 429, headers: { "content-type": "application/json" } });
          }
          if (res.status === 402) {
            return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos ao workspace." }), { status: 402, headers: { "content-type": "application/json" } });
          }
          if (!res.ok) {
            const t = await res.text();
            return new Response(JSON.stringify({ error: t || "Erro na IA" }), { status: 500, headers: { "content-type": "application/json" } });
          }

          const json = await res.json() as any;
          const reply = json.choices?.[0]?.message?.content ?? "";
          return new Response(JSON.stringify({ reply }), { headers: { "content-type": "application/json" } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message ?? "Erro" }), { status: 500, headers: { "content-type": "application/json" } });
        }
      },
    },
  },
});
