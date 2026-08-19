// ticket-transfer-start — o dono passa o ingresso adiante (§4 do framework).
//
// Recebe CPF, e-mail e telefone de quem vai receber; devolve o LINK que o dono
// manda pelo WhatsApp. Toda a validação (é seu? já usou? já transferiu uma vez?)
// mora na RPC `iniciar_transferencia_ingresso` — aqui só entra quem é o dono,
// pelo token da sessão, nunca por um id vindo do navegador.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const log = (step: string, d?: unknown) =>
  console.log(`[TRANSFER-START] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

// Mensagem que o dono lê. Cada uma explica o que fazer, porque "erro ao
// transferir" faz a pessoa tentar de novo sem entender o motivo.
const RECADOS: Record<string, string> = {
  ingresso_nao_e_seu: 'Este ingresso não está na sua conta.',
  ingresso_indisponivel: 'Este ingresso não está mais válido.',
  compra_nao_confirmada: 'A compra ainda não foi confirmada. Assim que o pagamento entrar, você poderá transferir.',
  ingresso_ja_utilizado: 'Este ingresso já foi utilizado na entrada — não é mais possível transferir.',
  ingresso_ja_transferido: 'Este ingresso já foi transferido uma vez. Quem recebeu não pode repassar adiante.',
  transferencia_em_andamento: 'Já existe uma transferência em andamento para este ingresso. Cancele a atual para começar outra.',
  cpf_do_proprio_dono: 'Este CPF é o seu. Informe o CPF de quem vai receber o ingresso.',
  cpf_invalido: 'CPF inválido. Confira e tente de novo.',
  ingresso_nao_encontrado: 'Ingresso não encontrado.',
};

function recado(erro: string): string {
  for (const [chave, texto] of Object.entries(RECADOS)) {
    if (erro.includes(chave)) return texto;
  }
  return 'Não foi possível iniciar a transferência. Tente novamente.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Faça login para transferir.' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return json({ error: 'Faça login para transferir.' }, 401);

    const { ticketId, cpf, email, telefone } = await req.json().catch(() => ({}));
    if (!ticketId) return json({ error: 'Ingresso não informado.' }, 400);

    const cpfLimpo = unformatCPF(String(cpf ?? ''));
    if (!validateCPF(cpfLimpo)) {
      return json({ error: 'CPF inválido. Confira e tente de novo.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Token do link: aleatório e sem significado. Não dá para adivinhar o de
    // outra pessoa a partir do seu — e ele sozinho não basta, porque o aceite
    // ainda exige o CPF certo.
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);

    const { data, error } = await admin.rpc('iniciar_transferencia_ingresso', {
      _ticket_id: ticketId,
      _user_id: userId,
      _to_cpf: cpfLimpo,
      _to_email: email ?? null,
      _to_phone: telefone ?? null,
      _token: token,
    });

    if (error) {
      log('Recusado', { userId, msg: error.message });
      return json({ error: recado(error.message || '') }, 409);
    }

    const base = Deno.env.get('SITE_PUBLIC_URL') || 'https://festpag.digital';
    log('Transferência iniciada', { ticketId, transferId: data?.transfer_id });

    return json({
      ok: true,
      transferId: data?.transfer_id,
      expiresAt: data?.expires_at,
      link: `${base.replace(/\/+$/, '')}/transferencia/${token}`,
    });

  } catch (e) {
    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    return json({ error: 'Não foi possível iniciar a transferência. Tente novamente.' }, 500);
  }
});
