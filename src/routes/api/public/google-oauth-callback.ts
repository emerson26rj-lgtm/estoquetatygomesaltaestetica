import { createFileRoute } from "@tanstack/react-router";

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Google Agenda</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px}
.card{max-width:480px;background:#1e293b;padding:32px;border-radius:12px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
h1{margin:0 0 12px;font-size:20px}p{color:#cbd5e1;line-height:1.5;margin:8px 0}a{color:#60a5fa;text-decoration:none}</style>
</head><body><div class="card">${body}</div>
<script>setTimeout(()=>{try{window.close()}catch(e){}}, 4000);</script></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/google-oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;

        if (error) return html(`<h1>Falha na autorização</h1><p>${error}</p><p><a href="/servicos">Voltar</a></p>`, 400);
        if (!code || !state) return html(`<h1>Parâmetros ausentes</h1><p>Tente novamente pela tela de Serviços.</p>`, 400);

        try {
          const { exchangeCode, fetchGoogleUserInfo } = await import("@/lib/google-calendar.server");
          const { createClient } = await import("@supabase/supabase-js");
          const tok = await exchangeCode({ code, origin });
          const info = await fetchGoogleUserInfo(tok.access_token);
          const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

          const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { error: upErr } = await db.from("professionals").update({
            google_access_token: tok.access_token,
            google_refresh_token: tok.refresh_token ?? undefined,
            google_token_expires_at: expiresAt,
            google_email: info.email ?? null,
            google_calendar_id: "primary",
            google_connected_at: new Date().toISOString(),
          }).eq("id", state);
          if (upErr) throw new Error(upErr.message);

          return html(`<h1>✓ Google Agenda conectado</h1><p>Conta <strong>${info.email ?? ""}</strong> vinculada com sucesso.</p><p>Você já pode fechar esta janela.</p><p><a href="/servicos">Voltar</a></p>`);
        } catch (e: any) {
          return html(`<h1>Erro ao conectar</h1><p>${e?.message ?? e}</p><p><a href="/servicos">Voltar</a></p>`, 500);
        }
      },
    },
  },
});
