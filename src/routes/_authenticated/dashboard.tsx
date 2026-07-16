import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { statusOf, statusLabel, currency } from "@/lib/stock";
import { AlertTriangle, TrendingUp, Package, DollarSign, Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Taty Gomes Alta Estética Gestão" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("*, products(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = products.length;
  const value = products.reduce((s, p: any) => s + Number(p.quantity) * Number(p.cost_value), 0);
  const low = products.filter((p: any) => statusOf(p.quantity, p.min_stock, p.expiry_date) === "low").length;
  const expiring = products.filter((p: any) => {
    const s = statusOf(p.quantity, p.min_stock, p.expiry_date);
    return s === "expiring" || s === "expired";
  }).length;

  const chart = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const outs = movements
      .filter((m: any) => m.type === "out" && m.created_at.slice(0, 10) === key)
      .reduce((s: number, m: any) => s + Number(m.quantity), 0);
    return { day: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), saidas: outs };
  });

  const critical = products
    .map((p: any) => ({ ...p, status: statusOf(p.quantity, p.min_stock, p.expiry_date) }))
    .filter((p: any) => p.status !== "ok")
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Visão geral</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Dashboard</h1>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Valor em Estoque" value={currency(value)} icon={DollarSign} accent="text-brand-primary" />
        <Kpi label="Produtos" value={String(total)} icon={Package} />
        <Kpi label="Itens em Baixa" value={String(low)} icon={AlertTriangle} accent={low > 0 ? "text-danger" : ""} />
        <Kpi label="Vencendo/Vencidos" value={String(expiring)} icon={TrendingUp} accent={expiring > 0 ? "text-warning" : ""} />
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Saídas — últimos 7 dias</h2>
            <span className="text-[11px] text-text-muted">Consumo diário</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="saidas" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 bg-brand-primary/5 ring-1 ring-brand-primary/10 border-0 shadow-none">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-5 rounded-md bg-brand-primary flex items-center justify-center">
              <div className="size-1.5 bg-white rounded-full" />
            </div>
            <h2 className="text-sm font-semibold">Assistente Inteligente</h2>
          </div>
          <p className="text-xs leading-relaxed text-text-main mb-4">
            Faça perguntas sobre seu estoque: itens críticos, sugestões de compra, tendências de consumo e relatórios automáticos.
          </p>
          <Link
            to="/ia"
            className="inline-flex items-center justify-center w-full bg-brand-primary text-white text-sm font-medium py-2 rounded-lg hover:bg-brand-primary/90"
          >
            Conversar com a IA
          </Link>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Produtos Críticos</h2>
          <Link to="/produtos" className="text-[11px] font-medium text-brand-primary underline underline-offset-4">Ver todos</Link>
        </div>
        <div className="space-y-2">
          {critical.length === 0 && (
            <Card className="p-6 text-center text-sm text-text-muted bg-surface ring-1 ring-black/5 border-0 shadow-none">
              Tudo em ordem. Nenhum produto crítico.
            </Card>
          )}
          {critical.map((p: any) => (
            <Card key={p.id} className="p-3 flex items-center justify-between gap-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-[11px] text-text-muted">Lote: {p.batch || "—"} • {p.unit}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <StatusBadge status={p.status} />
                <p className="text-[11px] font-medium">{p.quantity} {p.unit}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, accent = "" }: { label: string; value: string; icon: any; accent?: string }) {
  return (
    <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
        <Icon className={`size-4 ${accent || "text-text-muted"}`} />
      </div>
      <p className={`text-xl font-medium tracking-tight mt-2 ${accent}`}>{value}</p>
    </Card>
  );
}

export function StatusBadge({ status }: { status: "ok" | "low" | "expiring" | "expired" }) {
  const map = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
    low: "bg-amber-50 text-amber-700 ring-amber-200/60",
    expiring: "bg-rose-50 text-rose-700 ring-rose-200/60",
    expired: "bg-red-100 text-red-800 ring-red-300/60",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${map[status]}`}>{statusLabel[status]}</span>;
}
