import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldOff, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createUserAccount, deleteUserAccount } from "@/lib/admin-users.functions";
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
  const createUser = useServerFn(createUserAccount);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", makeAdmin: false });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setChecking(false);
      setCurrentUserId(u.user.id);
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

  async function handleDelete(userId: string) {
    setDeletingId(userId);
    try {
      await deleteUser({ data: { userId } });
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir usuário");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createUser({
        data: {
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim() || undefined,
          makeAdmin: form.makeAdmin,
        },
      });
      toast.success("Usuário criado com sucesso");
      setForm({ email: "", password: "", fullName: "", makeAdmin: false });
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
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
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted">Administração</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Usuários do sistema</h1>
          <p className="text-sm text-text-muted mt-1">{profiles.length} conta(s) cadastrada(s).</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              <UserPlus className="size-4 mr-1.5" /> Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo usuário</DialogTitle>
              <DialogDescription>
                Somente administradores podem criar contas. Informe os dados de acesso.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">Nome completo</Label>
                <Input id="nu-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-email">E-mail</Label>
                <Input id="nu-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-password">Senha</Label>
                <Input id="nu-password" type="text" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <p className="text-xs text-text-muted">Mínimo 6 caracteres. Compartilhe com o usuário para o primeiro acesso.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.makeAdmin} onCheckedChange={(v) => setForm({ ...form, makeAdmin: !!v })} />
                Conceder privilégios de administrador
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
                <Button type="submit" disabled={creating}>{creating ? "Criando…" : "Criar usuário"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggleAdmin(p.id, !admin)}>
                          {admin ? <><ShieldOff className="size-3.5 mr-1.5" /> Revogar admin</> : <><ShieldCheck className="size-3.5 mr-1.5" /> Tornar admin</>}
                        </Button>
                        {p.id !== currentUserId && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive" disabled={deletingId === p.id}>
                                <Trash2 className="size-3.5 mr-1.5" /> Excluir
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação é permanente. A conta de <strong>{p.full_name ?? p.email ?? "usuário"}</strong> será removida do sistema, incluindo acesso e papéis.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(p.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
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
