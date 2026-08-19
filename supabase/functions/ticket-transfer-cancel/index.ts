// ticket-transfer-cancel — o dono desiste da transferência.
//
// Vale enquanto ninguém aceitou: mandou o link para o contato errado, a pessoa
// desistiu, mudou de ideia. Sem isso o ingresso ficaria preso esperando alguém
// que não vem (o banco só admite uma transferência em andamento por ingresso).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Faça login.' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return json({ error: 'Faça login.' }, 401);

    const { transferId } = await req.json().catch(() => ({}));
    if (!transferId) return json({ error: 'Transferência não informada.' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const { error } = await admin.rpc('cancelar_transferencia_ingresso', {
      _transfer_id: transferId,
      _user_id: userId,
    });

    if (error) {
      const m = error.message || '';
      console.log(`[TRANSFER-CANCEL] recusado - ${m}`);
      if (m.includes('transferencia_ja_encerrada')) {
        // Pode ter sido aceita no meio do caminho: a tela precisa dizer isso, e
        // não "erro ao cancelar".
        return json({ error: 'Esta transferência já foi encerrada — pode ter sido aceita.' }, 409);
      }
      if (m.includes('transferencia_nao_e_sua')) return json({ error: 'Esta transferência não é sua.' }, 403);
      return json({ error: 'Não foi possível cancelar. Tente novamente.' }, 409);
    }

    return json({ ok: true });

  } catch (e) {
    console.log(`[TRANSFER-CANCEL] erro - ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: 'Não foi possível cancelar. Tente novamente.' }, 500);
  }
});
