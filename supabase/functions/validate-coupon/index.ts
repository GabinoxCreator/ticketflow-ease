import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// A linha de `event_coupons` que a função `buscar_cupom` devolve (só o que esta
// edge lê).
interface CupomAchado {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number | string;
  max_uses: number | null;
  uses_count: number;
  valid_until: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth required (verify_jwt=true at platform level + in-code claims check)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

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

    // Texto absurdo nem consulta o banco (o banco também recusa mais de 40
    // letras depois de tirar espaço e acento).
    if (!normalized || normalized.length > 100) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Cupom inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // OS-420: a comparação ignora espaço e acento ("PACHÁ 10" acha PACHA10 e
    // PACHÁ10), pela função `buscar_cupom` do banco (migration
    // 20261115235200). Continua SEM curinga (OS-269): é igualdade no código
    // normalizado, nunca `ilike`; `%`, `_` e `*` ficam no texto e não casam com
    // nada. Só cupom ativo; quando dois do mesmo evento viram o mesmo código, o
    // banco escolhe o digitado exatamente igual, depois o que ainda vale, depois
    // o mais antigo.
    const { data, error } = await supabase
      .rpc('buscar_cupom', { p_event_id: eventId, p_codigo: normalized })
      .maybeSingle<CupomAchado>();

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
