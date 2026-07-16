import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Sparkles, AlertTriangle } from "lucide-react";
import { forecastConsumption } from "@/lib/ai-forecast.functions";
import { currency } from "@/lib/stock";
import { DataPagination, usePagination } from "@/components/data-pagination";

export const Route = createFileRoute("/_authenticated/previsoes")({
  head: () => ({ meta: [{ title: "Previsões de Consumo — Taty Gomes Alta Estética Gestão" }] }),
  component: PrevisoesPage,
});

type Stat = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  min_stock: number;
  cost_value: number;
  avg_per_day: number;
  total_out_90d: number;
  days_left: number | null;
  suggested_buy: number;
  risk: "verde" | "amarelo" | "vermelho";
};

function PrevisoesPage() {
  const forecast = useServerFn(forecastConsumption);
  const [stats, setStats] = useState<Stat[]>([]);
  const [insights, setInsights] = useState<string>("");
  const [ranAt, setRanAt] = useState<string>("");

  const m = useMutation({
    mutationFn: async () => (await forecast()) as { stats: Stat[]; insights: string; generatedAt: string },
    onSuccess: (d) => {
      setStats(d.stats);
      setInsights(d.insights);
      setRanAt(d.generatedAt);
    },
  });

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(stats, 25);
  const totalBuy = stats.reduce((s, x) => s + x.suggested_buy * x.cost_value, 0);
  const critical = stats.filter((x) => x.risk === "vermelho").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">IA preditiva</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Previsões de consumo</h1>
          <p className="text-sm text-text-muted mt-1">Baseado no consumo real dos últimos 90 dias e nos parâmetros de cada produto.</p>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
          <Sparkles className="size-4 mr-1.5" /> {m.isPending ? "Analisando..." : "Gerar previsão"}
        </Button>
      </header>

      {stats.length > 0 && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi label="Produtos analisados" value={String(stats.length)} />
            <Kpi label="Críticos (≤ 7 dias)" value={String(critical)} accent={critical > 0 ? "text-danger" : ""} />
            <Kpi label="Compra sugerida (60d)" value={currency(totalBuy)} accent="text-brand-primary" />
          </section>

          {insights && (
            <Card className="p-5 bg-brand-primary/5 ring-1 ring-brand-primary/10 border-0 shadow-none">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-brand-primary" />
                <h2 className="text-sm font-semibold">Análise da IA</h2>
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{insights}</div>
              {ranAt && <p className="text-[11px] text-text-muted mt-3">Gerado em {new Date(ranAt).toLocaleString("pt-BR")}</p>}
            </Card>
          )}

          <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium text-right">Estoque</th>
                    <th className="p-3 font-medium text-right">Consumo/dia</th>
                    <th className="p-3 font-medium text-right">Dias restantes</th>
                    <th className="p-3 font-medium text-right">Sugestão (60d)</th>
                    <th className="p-3 font-medium">Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-page-bg/60">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-right">{p.quantity} {p.unit}</td>
                      <td className="p-3 text-right text-text-muted">{p.avg_per_day.toFixed(2)}</td>
                      <td className="p-3 text-right">{p.days_left ?? "—"}</td>
                      <td className="p-3 text-right font-medium">{p.suggested_buy > 0 ? `${p.suggested_buy} ${p.unit}` : "—"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${
                          p.risk === "vermelho" ? "bg-red-100 text-red-800 ring-red-300/60"
                          : p.risk === "amarelo" ? "bg-amber-50 text-amber-700 ring-amber-200/60"
                          : "bg-emerald-50 text-emerald-700 ring-emerald-200/60"
                        }`}>{p.risk}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataPagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          </Card>
        </>
      )}

      {stats.length === 0 && !m.isPending && (
        <Card className="p-10 text-center bg-surface ring-1 ring-black/5 border-0 shadow-none">
          <LineChart className="size-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">Clique em "Gerar previsão" para analisar o consumo do estoque.</p>
        </Card>
      )}

      {m.isError && (
        <Card className="p-4 flex items-center gap-2 bg-red-50 ring-1 ring-red-200 border-0 shadow-none text-sm text-red-800">
          <AlertTriangle className="size-4" /> {(m.error as any)?.message ?? "Erro ao gerar previsão"}
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4 bg-surface ring-1 ring-black/5 border-0 shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-xl font-medium tracking-tight mt-2 ${accent}`}>{value}</p>
    </Card>
  );
}
