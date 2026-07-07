import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Taty Gomes Alta Estética Gestão" },
      { name: "description", content: "Acesse o painel de gestão de estoque da sua clínica." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const em = emailSchema.parse(email);
      const pw = passwordSchema.parse(password);
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
      toast.success("Bem-vindo(a) de volta.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page-bg px-4">
      <Card className="w-full max-w-md p-8 bg-surface ring-1 ring-black/5 border-0 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-9 rounded-full bg-brand-primary/10 flex items-center justify-center ring-1 ring-brand-primary/20">
            <div className="size-2 rounded-full bg-brand-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Taty Gomes Alta Estética Gestão</h1>
            <p className="text-xs text-text-muted">Estoque inteligente para clínicas</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold tracking-tight mb-1">Entrar</h2>
        <p className="text-sm text-text-muted mb-6">
          Acesse o painel da sua clínica. Novos acessos são criados pelo administrador.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white">
            {loading ? "Aguarde..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-text-muted">
          Precisa de acesso? Peça ao administrador para criar sua conta.
        </p>
      </Card>
    </div>
  );
}
