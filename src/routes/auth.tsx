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
      { title: "Entrar — Dermasul Gestão" },
      { name: "description", content: "Acesse o painel de gestão de estoque da sua clínica." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: em,
          password: pw,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: name.trim() || em.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Cadastro criado. Você já pode entrar.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
        toast.success("Bem-vindo(a) de volta.");
        navigate({ to: "/dashboard", replace: true });
      }
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
            <h1 className="text-base font-semibold tracking-tight">Dermasul Gestão</h1>
            <p className="text-xs text-text-muted">Estoque inteligente para clínicas</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold tracking-tight mb-1">
          {mode === "signin" ? "Entrar" : "Criar conta"}
        </h2>
        <p className="text-sm text-text-muted mb-6">
          {mode === "signin" ? "Acesse o painel da sua clínica." : "O primeiro cadastro recebe acesso de administrador."}
        </p>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white">
            {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full text-center text-xs text-brand-primary underline underline-offset-4"
        >
          {mode === "signin" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </Card>
    </div>
  );
}
