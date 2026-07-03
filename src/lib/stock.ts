import { supabase } from "@/integrations/supabase/client";

export async function logAudit(action: string, entity: string, entity_id?: string, details?: any) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("audit_log").insert({
    user_id: u.user.id,
    action,
    entity,
    entity_id: entity_id ?? null,
    details: details ?? null,
  });
}

export function statusOf(qty: number, min: number, expiry: string | null): "ok" | "low" | "expiring" | "expired" {
  if (expiry) {
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (days < 0) return "expired";
    if (days <= 30) return "expiring";
  }
  if (qty <= 0) return "low";
  if (qty <= min) return "low";
  return "ok";
}

export const statusLabel: Record<ReturnType<typeof statusOf>, string> = {
  ok: "OK", low: "Baixo", expiring: "Vencendo", expired: "Vencido",
};

export function currency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}
