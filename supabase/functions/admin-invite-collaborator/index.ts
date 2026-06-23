import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_SECTIONS = new Set([
  'dashboard',
  'produtores',
  'repasses',
  'checklist',
  'saude',
  'configuracoes',
  '_manage_team',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Validate caller has _manage_team
    const { data: mt } = await admin
      .from('admin_section_permissions')
      .select('section')
      .eq('user_id', callerId)
      .eq('section', '_manage_team')
      .maybeSingle();
    if (!mt) return json({ error: 'forbidden_not_manager' }, 403);

    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const nome_completo = String(body?.nome_completo ?? '').trim();
    const sections: string[] = Array.isArray(body?.sections) ? body.sections : [];

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'invalid_email' }, 400);
    }
    if (!nome_completo) return json({ error: 'missing_name' }, 400);
    const cleanSections = Array.from(new Set(sections.filter((s) => ALLOWED_SECTIONS.has(s))));

    // Check if email already has an auth user that's admin
    const { data: { user: existingUser } } = await admin.auth.admin.getUserByEmail(email);

    let targetUserId: string;
    if (existingUser) {
      // Check if already admin
      const { data: roleRow } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (roleRow) {
        return json({ error: 'already_admin', user_id: existingUser.id }, 409);
      }
      // Promote: insert admin role + profile if missing
      targetUserId = existingUser.id;
      await admin.from('profiles').upsert({ id: targetUserId, nome_completo, email, whatsapp: '' });
      await admin.from('user_roles').insert({ user_id: targetUserId, role: 'admin' });
    } else {
      const redirectTo = `${new URL(req.url).origin.replace('/functions/v1/admin-invite-collaborator', '')}`;
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { nome_completo, tipo_conta: 'admin' },
        redirectTo,
      });
      if (inviteErr || !invited.user) {
        return json({ error: 'invite_failed', detail: inviteErr?.message }, 500);
      }
      targetUserId = invited.user.id;

      // Concede o admin AQUI via service-role, sem depender do handle_new_user.
      // Idempotente: hoje (antes do passo B) o trigger ainda honra tipo_conta='admin' e já
      // cria essa linha no invite, então a UNIQUE(user_id, role) colidiria — onConflict +
      // ignoreDuplicates = ON CONFLICT DO NOTHING, então convite repetido não dá 500. Vale
      // também pós-passo B (quando o trigger parar de criar): o upsert passa a inserir.
      const { error: roleErr } = await admin
        .from('user_roles')
        .upsert(
          { user_id: targetUserId, role: 'admin' },
          { onConflict: 'user_id,role', ignoreDuplicates: true },
        );
      if (roleErr) {
        console.error('grant admin role error', roleErr);
        return json({ error: 'role_grant_failed', detail: roleErr.message }, 500);
      }
    }

    // Insert sections (service role bypasses RLS)
    if (cleanSections.length > 0) {
      const rows = cleanSections.map((s) => ({ user_id: targetUserId, section: s }));
      const { error: secErr } = await admin
        .from('admin_section_permissions')
        .upsert(rows, { onConflict: 'user_id,section' });
      if (secErr) console.error('section insert error', secErr);
    }

    await admin.from('audit_logs').insert({
      actor_id: callerId,
      action: 'admin_collaborator_invited',
      target_type: 'user',
      target_id: targetUserId,
      metadata: { email, sections: cleanSections, promoted_existing: !!existingUser },
    });

    return json({ ok: true, user_id: targetUserId, promoted_existing: !!existingUser });
  } catch (e) {
    console.error(e);
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
