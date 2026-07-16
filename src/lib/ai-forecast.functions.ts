import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const forecastConsumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const [{ data: products }, { data: movements }] = await Promise.all([
      supabase.from("products").select("id,name,unit,quantity,min_stock,cost_value,expiry_date"),
      supabase
        .from("movements")
        .select("product_id,type,quantity,created_at")
        .gte("created_at", since.toISOString())
        .eq("type", "out"),
    ]);

    const usage = new Map<string, { total: number; days: Set<string> }>();
    for (const m of movements ?? []) {
      const cur = usage.get(m.product_id) ?? { total: 0, days: new Set<string>() };
      cur.total += Number(m.quantity);
      cur.days.add(String(m.created_at).slice(0, 10));
      usage.set(m.product_id, cur);
    }

    const stats = (products ?? []).map((p: any) => {
      const u = usage.get(p.id);
      const totalOut = u?.total ?? 0;
      const avgPerDay = totalOut / 90;
      const daysLeft = avgPerDay > 0 ? Math.round(Number(p.quantity) / avgPerDay) : null;
      const suggestedBuy = avgPerDay > 0 ? Math.max(0, Math.ceil(avgPerDay * 60 - Number(p.quantity))) : 0;
      let risk: "verde" | "amarelo" | "vermelho" = "verde";
      if (daysLeft !== null && daysLeft <= 7) risk = "vermelho";
      else if (daysLeft !== null && daysLeft <= 21) risk = "amarelo";
      else if (Number(p.quantity) <= Number(p.min_stock)) risk = "amarelo";
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        quantity: Number(p.quantity),
        min_stock: Number(p.min_stock),
        cost_value: Number(p.cost_value),
        avg_per_day: Number(avgPerDay.toFixed(2)),
        total_out_90d: totalOut,
        days_left: daysLeft,
        suggested_buy: suggestedBuy,
        risk,
      };
    });

    stats.sort((a, b) => {
      const order = { vermelho: 0, amarelo: 1, verde: 2 } as const;
      return order[a.risk] - order[b.risk] || (a.days_left ?? 9999) - (b.days_left ?? 9999);
    });

    // Ask AI for narrative analysis
    const key = process.env.LOVABLE_API_KEY;
    let insights = "";
    if (key) {
      try {
        const top = stats.slice(0, 15);
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model: "google/gemini-3.5-flash",
            messages: [
              { role: "system", content: "Você é um especialista em gestão de estoque para clínicas de estética. Responda em português brasileiro, com bullets curtos e objetivos." },
              { role: "user", content: `Analise a previsão de consumo abaixo e gere: 1) 3 alertas prioritários, 2) sugestão de pedido de compra consolidado, 3) observações sobre padrões de consumo. Dados JSON:\n${JSON.stringify(top)}` },
            ],
          }),
        });
        if (res.ok) {
          const j = await res.json() as any;
          insights = j.choices?.[0]?.message?.content ?? "";
        }
      } catch {
        insights = "";
      }
    }

    return { stats, insights, generatedAt: new Date().toISOString() };
  });
