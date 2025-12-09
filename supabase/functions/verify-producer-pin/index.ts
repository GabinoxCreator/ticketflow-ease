import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logStep = (step: string, details?: any) => {
  console.log(`[VERIFY-PRODUCER-PIN] ${step}`, details ? JSON.stringify(details) : '')
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    logStep('Function started')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    logStep('User authenticated', { userId: user.id })

    const { pin } = await req.json()

    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be 4 digits')
    }

    // Get the stored PIN hash
    const { data: account, error: accountError } = await supabaseClient
      .from('producer_stripe_accounts')
      .select('pin_hash')
      .eq('user_id', user.id)
      .single()

    if (accountError || !account?.pin_hash) {
      logStep('No PIN found for user')
      return new Response(
        JSON.stringify({ valid: false, error: 'PIN not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Hash the provided PIN and compare
    const hashedPin = await hashPin(pin)
    const isValid = hashedPin === account.pin_hash

    logStep('PIN verification result', { valid: isValid })

    return new Response(
      JSON.stringify({ valid: isValid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    logStep('Error', { message: error.message })
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
