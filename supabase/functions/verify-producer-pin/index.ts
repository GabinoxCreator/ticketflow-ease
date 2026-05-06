import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  console.log(`[VERIFY-PRODUCER-PIN] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('User not authenticated');

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Rate limit per user
    const rl = await checkRateLimit(serviceClient, `pin:user:${user.id}`, 5, 600, 1800);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { pin } = await req.json();
    if (!pin || !/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');

    const { data: account } = await serviceClient
      .from('producer_stripe_accounts')
      .select('pin_hash')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!account?.pin_hash) {
      logStep('No PIN found for user');
      return new Response(
        JSON.stringify({ valid: false, error: 'PIN not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Legacy SHA-256 hash → force reset
    if (!account.pin_hash.startsWith('$2')) {
      logStep('Legacy hash detected, requiring reset');
      return new Response(
        JSON.stringify({ valid: false, needs_reset: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isValid = compareSync(pin, account.pin_hash);
    logStep('PIN verification result', { valid: isValid });

    return new Response(
      JSON.stringify({ valid: isValid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    logStep('Error', { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
