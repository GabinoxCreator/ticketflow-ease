// Edge: debug-env — DESATIVADA. Leitura pontual já concluída em 17/08/2026.
// Mantida apenas como stub morto até ser removida do projeto Supabase.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
