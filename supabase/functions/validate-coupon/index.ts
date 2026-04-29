import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { eventId, code } = await req.json();
    if (!eventId || !code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, message: 'Dados inválidos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const normalized = code.trim().toUpperCase();

    const { data, error } = await supabase
      .from('event_coupons')
      .select('id, code, discount_type, discount_value, max_uses, uses_count, valid_until, is_active')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .ilike('code', normalized)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Cupom inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (data.valid_until && new Date(data.valid_until).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Cupom expirado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (data.max_uses != null && data.uses_count >= data.max_uses) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Cupom esgotado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        couponId: data.id,
        code: data.code,
        discountType: data.discount_type,
        discountValue: Number(data.discount_value),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ valid: false, message: e.message || 'Erro ao validar cupom' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
