import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const email = "marciamnabucov@gmail.com";
  const newPassword = "Enzo#$1935";
  let user: any = null;
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) { user = found; break; }
    if (data.users.length < 1000) break;
    page++;
  }
  if (!user) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, id: user.id }), { headers: { "Content-Type": "application/json" } });
});
