// ticket-transfer-accept — a pessoa aceita e o ingresso passa a ser dela.
//
// Chega aqui já logada: a tela cria a conta (ou entra numa existente) e só
// depois chama esta função. Fazer a conta nascer aqui dentro significaria esta
// edge criar usuário, o que é poder demais para uma função que qualquer link
// alcança.
//
// A regra que protege o link vazado mora na RPC: quem aceita precisa informar
// EXATAMENTE o CPF que o dono apontou ao transferir. O link sozinho não entrega
// ingresso a ninguém.
//
// No aceite, a RPC mata o QR antigo e gera um novo — quem ficou com print do
// ingresso velho não entra.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const RECADOS: Record<string, string> = {
  link_invalido: 'Este link não existe. Confira com quem enviou.',
  link_expirado: 'Este link venceu (vale 24 horas). Peça um novo para quem enviou.',
  ja_aceita: 'Este ingresso já foi aceito.',
  transferencia_cancelada: 'Quem enviou cancelou esta transferência.',
  cpf_nao_confere: 'O CPF informado não é o mesmo que quem enviou apontou. Confira com a pessoa.',
  // Acontece quando o dono abre o próprio link estando logado. Sem esta frase,
  // ele levaria um erro genérico e não entenderia por quê (Gabriel, 21/08).
  nao_pode_aceitar_para_si: 'Este é o seu próprio link de transferência. Ele precisa ser aberto pela pessoa que vai receber o ingresso, na conta dela.',
  ingresso_ja_utilizado: 'Este ingresso já foi utilizado na entrada — a transferência foi encerrada.',
  ingresso_indisponivel: 'Este ingresso não está mais válido.',
  ingresso_nao_encontrado: 'Ingresso não encontrado.',
};

function recado(erro: string): string {
  for (const [chave, texto] of Object.entries(RECADOS)) {
    if (erro.includes(chave)) return texto;
  }
  return 'Não foi possível aceitar o ingresso. Tente novamente.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Crie sua conta ou entre para aceitar o ingresso.' }, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user?.id) return json({ error: 'Crie sua conta ou entre para aceitar o ingresso.' }, 401);

    const { token, cpf, nome, telefone } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'Link não informado.' }, 400);

    const cpfLimpo = unformatCPF(String(cpf ?? ''));
    if (!validateCPF(cpfLimpo)) return json({ error: 'CPF inválido. Confira e tente de novo.' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const { data, error } = await admin.rpc('aceitar_transferencia_ingresso', {
      _token: token,
      _novo_user_id: user.id,
      _cpf_informado: cpfLimpo,
      _nome: nome ?? null,
      _email: user.email ?? null,
      _telefone: telefone ?? null,
    });

    if (error) {
      console.log(`[TRANSFER-ACCEPT] recusado - ${error.message}`);
      return json({ error: recado(error.message || '') }, 409);
    }

    // O CPF do titular fica no ingresso; guardar também no perfil evita pedir
    // de novo na próxima compra — e é o mesmo CPF que a trava de 1 por noite lê.
    try {
      await admin.from('profiles')
        .update({ cpf: cpfLimpo })
        .eq('id', user.id)
        .is('cpf', null);
    } catch { /* perfil é conveniência: não pode derrubar o aceite */ }

    console.log(`[TRANSFER-ACCEPT] aceito - ticket ${data?.ticket_id}`);
    return json({ ok: true, ticketId: data?.ticket_id, eventId: data?.event_id });

  } catch (e) {
    console.log(`[TRANSFER-ACCEPT] erro - ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: 'Não foi possível aceitar o ingresso. Tente novamente.' }, 500);
  }
});
