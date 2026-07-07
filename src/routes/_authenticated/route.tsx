import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Package, ArrowLeftRight, Truck, FileText, ShieldCheck, Sparkles, LogOut, Users, UserCog, FileHeart, Scissors,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/clientes", label: "Clientes", icon: Users, adminOnly: false },
  { to: "/anamnese", label: "Anamnese", icon: FileHeart, adminOnly: false },
  { to: "/produtos", label: "Produtos", icon: Package, adminOnly: false },
  { to: "/servicos", label: "Serviços", icon: Scissors, adminOnly: false },
  { to: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight, adminOnly: false },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, adminOnly: false },
  { to: "/relatorios", label: "Relatórios", icon: FileText, adminOnly: false },
  { to: "/ia", label: "Assistente IA", icon: Sparkles, adminOnly: false },
  { to: "/usuarios", label: "Usuários", icon: UserCog, adminOnly: true },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, adminOnly: true },
] as const;

function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visibleItems = items.filter((i) => !i.adminOnly || isAdmin);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-brand-primary/10 flex items-center justify-center ring-1 ring-brand-primary/20 shrink-0">
            <div className="size-2 rounded-full bg-brand-primary" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight truncate">Taty Gomes Alta Estética</p>
              <p className="text-[10px] text-text-muted truncate">Gestão de Estoque</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Módulos</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const active = pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="size-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

function AuthLayout() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("usuário");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const admin = !!roles?.some((r) => r.role === "admin");
      setIsAdmin(admin);
      if (admin) setRole("administrador");
    });
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-page-bg">
        <AppSidebar isAdmin={isAdmin} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 h-14 flex items-center justify-between gap-3 border-b border-border/60 bg-page-bg/80 backdrop-blur-md px-3 sm:px-6">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <span className="text-[11px] uppercase tracking-wider text-text-muted hidden sm:inline">Painel</span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium truncate max-w-[200px]">{email}</p>
                <p className="text-[10px] text-text-muted capitalize">{role}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-text-muted hover:text-foreground">
                <LogOut className="size-4" />
                <span className="hidden sm:inline ml-1.5 text-xs">Sair</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
