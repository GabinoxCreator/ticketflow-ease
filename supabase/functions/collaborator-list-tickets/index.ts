import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { event_id, collaborator_id, session_token } = await req.json();

    if (!event_id || !collaborator_id) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);


    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();

    if (!access) {
      return new Response(JSON.stringify({ error: 'Sem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id, ticket_code, holder_name, holder_email, holder_phone, status, validated_at, order_id, event_lots(name)')
      .eq('event_id', event_id)
      .in('status', ['valid', 'used'])
      .order('holder_name', { ascending: true })
      .limit(10000);

    if (error) {
      console.error('[LIST-TICKETS] query error:', error);
      return new Response(JSON.stringify({ error: 'Erro ao listar ingressos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fallback name resolution: tickets.holder_name -> orders.customer_name -> profiles.nome_completo
    const orderIds = Array.from(new Set((tickets || []).map((t: any) => t.order_id).filter(Boolean)));
    const ordersMap = new Map<string, { name?: string; user_id?: string }>();
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_name, user_id')
        .in('id', orderIds);
      (orders || []).forEach((o: any) => ordersMap.set(o.id, { name: o.customer_name, user_id: o.user_id }));
    }
    const userIds = Array.from(new Set(Array.from(ordersMap.values()).map(o => o.user_id).filter(Boolean))) as string[];
    const profilesMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nome_completo')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => { if (p.nome_completo) profilesMap.set(p.id, p.nome_completo); });
    }

    const formatted = (tickets || []).map((t: any) => {
      const order = t.order_id ? ordersMap.get(t.order_id) : undefined;
      const resolvedName =
        (t.holder_name && t.holder_name.trim()) ||
        (order?.name && order.name.trim()) ||
        (order?.user_id && profilesMap.get(order.user_id)) ||
        null;
      return {
        id: t.id,
        ticket_code: t.ticket_code,
        holder_name: resolvedName,
        holder_email: t.holder_email,
        holder_phone: t.holder_phone,
        status: t.status,
        validated_at: t.validated_at,
        lot_name: t.event_lots?.name,
      };
    });

    return new Response(JSON.stringify({ tickets: formatted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[LIST-TICKETS] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
