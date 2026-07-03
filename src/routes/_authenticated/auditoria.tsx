import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Dermasul Gestão" }] }),
  component: AuditPage,
});

function AuditPage() {
  const { data: logs = [], error } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Segurança</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Auditoria</h1>
        <p className="text-sm text-text-muted mt-1">Somente administradores visualizam este registro.</p>
      </header>

      <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
        {error && <p className="p-6 text-sm text-danger">Acesso restrito a administradores.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="p-3 font-medium">Data</th>
                <th className="p-3 font-medium">Usuário</th>
                <th className="p-3 font-medium">Ação</th>
                <th className="p-3 font-medium">Entidade</th>
                <th className="p-3 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !error && (
                <tr><td colSpan={5} className="p-6 text-center text-text-muted">Nenhum evento registrado.</td></tr>
              )}
              {logs.map((l: any) => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-page-bg/60">
                  <td className="p-3 text-text-muted">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 text-text-muted font-mono text-[11px]">{l.user_id?.slice(0, 8) ?? "—"}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3 text-text-muted">{l.entity}</td>
                  <td className="p-3 text-text-muted text-xs">{l.details ? JSON.stringify(l.details) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
