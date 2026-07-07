import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { deleteUserAccount } from "@/lib/admin-users.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Taty Gomes Alta Estética Gestão" }] }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const qc = useQueryClient();
  const deleteUser = useServerFn(deleteUserAccount);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setChecking(false);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      setIsAdmin(!!data?.some((r) => r.role === "admin"));
      setChecking(false);
    })();
  }, []);

  const { data: profiles = [], error } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
    retry: false,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
    enabled: isAdmin,
  });

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    if (makeAdmin) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Promovido a administrador");
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Privilégio de administrador removido");
    }
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  if (checking) return <p className="text-sm text-text-muted">Carregando…</p>;
  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-danger">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Administração</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Usuários do sistema</h1>
        <p className="text-sm text-text-muted mt-1">{profiles.length} conta(s) cadastrada(s).</p>
      </header>

      <Card className="bg-surface ring-1 ring-black/5 border-0 shadow-none overflow-hidden">
        {error && <p className="p-6 text-sm text-danger">Erro ao carregar contas.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                <th className="p-3 font-medium">Nome</th>
                <th className="p-3 font-medium">E-mail</th>
                <th className="p-3 font-medium">Papéis</th>
                <th className="p-3 font-medium">Cadastrado em</th>
                <th className="p-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p: any) => {
                const userRoles = roles.filter((r: any) => r.user_id === p.id).map((r: any) => r.role);
                const admin = userRoles.includes("admin");
                return (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-page-bg/60">
                    <td className="p-3">{p.full_name ?? "—"}</td>
                    <td className="p-3 text-text-muted">{p.email ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {userRoles.length === 0 && <Badge variant="outline">usuário</Badge>}
                        {userRoles.map((r: string) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "outline"}>{r}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-text-muted text-xs">{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => toggleAdmin(p.id, !admin)}>
                        {admin ? <><ShieldOff className="size-3.5 mr-1.5" /> Revogar admin</> : <><ShieldCheck className="size-3.5 mr-1.5" /> Tornar admin</>}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {profiles.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-text-muted">Nenhuma conta encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
