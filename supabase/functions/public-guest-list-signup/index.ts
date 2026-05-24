import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { slug, name } = await req.json();

    if (!slug || !name) {
      return new Response(
        JSON.stringify({ error: 'Slug e nome são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve list FIRST (so a wrong slug doesn't pollute rate-limit buckets)
    const { data: list, error: listError } = await supabase
      .from('guest_lists')
      .select(`id, name, valid_until_time, is_active, max_guests, event:events(id, date)`)
      .eq('public_slug', slug)
      .single();

    if (listError || !list) {
      return new Response(
        JSON.stringify({ error: 'Lista não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit by IP+list
    const ip = getClientIp(req);
    const rl = await checkRateLimit(supabase, `guest:ip:${ip}:${list.id}`, 5, 600, 600);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    if (!list.is_active) {
      return new Response(
        JSON.stringify({ error: 'Esta lista está fechada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventData: any = Array.isArray(list.event) ? list.event[0] : list.event;
    const now = new Date();
    // Build deadline directly in Brasília time (UTC-3) to avoid server timezone shifts
    const timePart = (list.valid_until_time || '18:00').slice(0, 5);
    const validUntil = new Date(`${eventData.date}T${timePart}:00-03:00`);
    // End of event day in Brasília time (used to detect "evento já passou")
    const endOfEventDay = new Date(`${eventData.date}T23:59:59-03:00`);

    if (now > validUntil && now <= endOfEventDay) {
      return new Response(
        JSON.stringify({ error: 'O prazo para inscrição expirou' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (now > endOfEventDay) {
      return new Response(
        JSON.stringify({ error: 'Este evento já passou' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency: if a public entry with same normalized name exists, return duplicate
    const normalizedName = name.trim().toLowerCase();
    const { data: existing } = await supabase
      .from('guest_list_entries')
      .select('id, name')
      .eq('guest_list_id', list.id)
      .eq('added_by', 'public');
    if (existing?.some((e: any) => (e.name ?? '').trim().toLowerCase() === normalizedName)) {
      return new Response(
        JSON.stringify({ success: true, duplicate: true, message: 'Você já está nesta lista' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (list.max_guests) {
      const { count } = await supabase
        .from('guest_list_entries')
        .select('*', { count: 'exact', head: true })
        .eq('guest_list_id', list.id);
      if (count !== null && count >= list.max_guests) {
        return new Response(
          JSON.stringify({ error: 'Esta lista está cheia' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: entry, error: insertError } = await supabase
      .from('guest_list_entries')
      .insert({
        guest_list_id: list.id,
        name: name.trim(),
        added_by: 'public',
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      // 23505 = unique violation (idempotent duplicate)
      if ((insertError as any).code === '23505') {
        return new Response(
          JSON.stringify({ success: true, duplicate: true, message: 'Você já está nesta lista' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('[GUEST-SIGNUP] insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao realizar inscrição' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, entry }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[GUEST-SIGNUP] error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
