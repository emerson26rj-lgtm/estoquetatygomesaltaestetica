import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  client_name: z.string().max(200).nullable().optional(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(["scheduled", "confirmed", "completed", "canceled", "no_show"]).default("scheduled"),
  price: z.number().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => upsertSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      professional_id: data.professional_id,
      service_id: data.service_id ?? null,
      client_id: data.client_id ?? null,
      client_name: data.client_name ?? null,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      status: data.status,
      price: data.price ?? null,
      notes: data.notes ?? null,
    };

    const res = data.id
      ? await supabase.from("appointments").update(payload).eq("id", data.id).select("*").single()
      : await supabase.from("appointments").insert({ ...payload, created_by: userId }).select("*").single();
    if (res.error) throw new Error(res.error.message);
    const appt = res.data!;

    // Google Calendar sync (best-effort)
    try {
      const { data: prof } = await supabase
        .from("professionals")
        .select("id, name, google_refresh_token, google_calendar_id")
        .eq("id", data.professional_id)
        .maybeSingle();

      if (prof?.google_refresh_token) {
        const { data: service } = data.service_id
          ? await supabase.from("services").select("name").eq("id", data.service_id).maybeSingle()
          : { data: null as any };
        const clientLabel = data.client_name || (data.client_id
          ? (await supabase.from("clientes").select("nome").eq("id", data.client_id).maybeSingle()).data?.nome
          : null) || "Cliente";

        const summary = `${service?.name || "Atendimento"} — ${clientLabel}`;
        const description = [data.notes, `Profissional: ${prof.name}`].filter(Boolean).join("\n");

        const { upsertCalendarEvent, deleteCalendarEvent } = await import("./google-calendar.server");

        if (data.status === "canceled" && appt.google_event_id) {
          await deleteCalendarEvent({
            professionalId: prof.id,
            calendarId: appt.google_calendar_id,
            eventId: appt.google_event_id,
          });
          await supabase.from("appointments").update({
            google_event_id: null,
            google_calendar_id: null,
            google_sync_error: null,
          }).eq("id", appt.id);
        } else {
          const result = await upsertCalendarEvent({
            professionalId: prof.id,
            calendarId: appt.google_calendar_id ?? prof.google_calendar_id ?? null,
            eventId: appt.google_event_id ?? null,
            event: {
              summary,
              description,
              starts_at: data.starts_at,
              ends_at: data.ends_at,
            },
          });
          await supabase.from("appointments").update({
            google_event_id: result.eventId,
            google_calendar_id: result.calendarId,
            google_sync_error: null,
          }).eq("id", appt.id);
        }
      }
    } catch (err: any) {
      await supabase.from("appointments").update({ google_sync_error: String(err?.message ?? err) }).eq("id", appt.id);
    }

    return { id: appt.id };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, professional_id, google_event_id, google_calendar_id")
      .eq("id", data.id)
      .maybeSingle();
    if (appt?.google_event_id) {
      try {
        const { deleteCalendarEvent } = await import("./google-calendar.server");
        await deleteCalendarEvent({
          professionalId: appt.professional_id,
          calendarId: appt.google_calendar_id,
          eventId: appt.google_event_id,
        });
      } catch { /* ignore */ }
    }
    const { error } = await supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ professional_id: z.string().uuid(), origin: z.string().url() }).parse(v))
  .handler(async ({ data }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Credenciais Google não configuradas. Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.");
    const { buildAuthorizeUrl } = await import("./google-calendar.server");
    const url = buildAuthorizeUrl({
      clientId,
      origin: data.origin,
      state: data.professional_id,
    });
    return { url };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ professional_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("professionals").update({
      google_email: null,
      google_calendar_id: null,
      google_access_token: null,
      google_refresh_token: null,
      google_token_expires_at: null,
      google_connected_at: null,
    }).eq("id", data.professional_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
