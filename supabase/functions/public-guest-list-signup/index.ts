import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { slug, name } = await req.json();

    if (!slug || !name) {
      return new Response(
        JSON.stringify({ error: 'Slug e nome são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the guest list
    const { data: list, error: listError } = await supabase
      .from('guest_lists')
      .select(`
        id,
        name,
        valid_until_time,
        is_active,
        max_guests,
        event:events (
          id,
          date
        )
      `)
      .eq('public_slug', slug)
      .single();

    if (listError || !list) {
      console.error('List not found:', listError);
      return new Response(
        JSON.stringify({ error: 'Lista não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if list is active
    if (!list.is_active) {
      return new Response(
        JSON.stringify({ error: 'Esta lista está fechada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get event data
    const eventData = Array.isArray(list.event) ? list.event[0] : list.event;

    // Check time validity
    const now = new Date();
    const eventDate = new Date(eventData.date);
    const [hours, minutes] = list.valid_until_time.split(':').map(Number);
    
    const validUntil = new Date(eventDate);
    validUntil.setHours(hours, minutes, 0, 0);

    // If event is today, check time
    if (now.toDateString() === eventDate.toDateString()) {
      if (now >= validUntil) {
        return new Response(
          JSON.stringify({ error: 'O prazo para inscrição expirou' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (eventDate < now) {
      return new Response(
        JSON.stringify({ error: 'Este evento já passou' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check max guests limit
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

    // Add the guest to the list
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
      console.error('Error inserting entry:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao realizar inscrição' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Guest added successfully:', entry);

    return new Response(
      JSON.stringify({ success: true, entry }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in public-guest-list-signup:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
