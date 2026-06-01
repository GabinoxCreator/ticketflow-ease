import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: 'unauthorized' }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: mt } = await admin
      .from('admin_section_permissions')
      .select('section')
      .eq('user_id', callerId)
      .eq('section', '_manage_team')
      .maybeSingle();
    if (!mt) return json({ error: 'forbidden_not_manager' }, 403);

    const body = await req.json().catch(() => null);
    const targetUserId = String(body?.target_user_id ?? '');
    if (!targetUserId) return json({ error: 'missing_target' }, 400);
    if (targetUserId === callerId) {
      return json({ error: 'cannot_deactivate_self' }, 400);
    }

    // Last-manager check
    const { data: targetMt } = await admin
      .from('admin_section_permissions')
      .select('section')
      .eq('user_id', targetUserId)
      .eq('section', '_manage_team')
      .maybeSingle();

    if (targetMt) {
      const { count } = await admin
        .from('admin_section_permissions')
        .select('user_id', { count: 'exact', head: true })
        .eq('section', '_manage_team')
        .neq('user_id', targetUserId);
      if (!count || count === 0) {
        return json(
          {
            error: 'cannot_remove_last_manage_team',
            message:
              'Não é possível remover o último gestor de equipe. Promova outro colaborador a gestor antes.',
          },
          409,
        );
      }
    }

    // Delete permissions then admin role
    const { error: delPermErr } = await admin
      .from('admin_section_permissions')
      .delete()
      .eq('user_id', targetUserId);
    if (delPermErr) return json({ error: 'delete_perms_failed', detail: delPermErr.message }, 500);

    const { error: delRoleErr } = await admin
      .from('user_roles')
      .delete()
      .eq('user_id', targetUserId)
      .eq('role', 'admin');
    if (delRoleErr) return json({ error: 'delete_role_failed', detail: delRoleErr.message }, 500);

    await admin.from('audit_logs').insert({
      actor_id: callerId,
      action: 'admin_collaborator_deactivated',
      target_type: 'user',
      target_id: targetUserId,
      metadata: {},
    });

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
