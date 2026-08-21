// ticket-transfer-info — o que a pessoa vê ao abrir o link, ANTES de aceitar.
//
// Pública de propósito (`verify_jwt=false`): quem recebe ainda não tem conta —
// é justamente essa tela que vai pedir para ela criar uma. Sem isso, o link
// levaria a um cadastro às cegas, sem dizer para qual evento é o ingresso.
//
// ⚠️ O QUE ELA NÃO DEVOLVE: o código do ingresso (o QR), o nome completo ou o
// contato de quem está transferindo, e o CPF de destino inteiro. Um link é algo
// que circula em grupo de WhatsApp — ele mostra o suficiente para a pessoa
// reconhecer o convite e nada que sirva para outra coisa. Do CPF vão só os 3
// últimos dígitos, para ela conferir que é mesmo o dela.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { maskEmail } from "../_shared/pii.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Primeiro nome só. "Ana Paula Sakaki" vira "Ana". */
function primeiroNome(nome: string | null): string {
  const n = String(nome ?? '').trim().split(/\s+/)[0];
  return n || 'Alguém';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'link_invalido' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Higiene antes de responder: link vencido tem que aparecer como vencido,
    // não como pendente.
    await admin.rpc('expirar_transferencias_vencidas', { _ticket_id: null });

    const { data: tr } = await admin
      .from('ticket_transfers')
      .select('id, status, expires_at, to_cpf, from_holder_name, ticket_id, event_id')
      .eq('token', token)
      .maybeSingle();

    if (!tr) return json({ error: 'link_invalido' }, 404);

    const { data: ev } = await admin
      .from('events')
      .select('title, date, time, venue, city, state, image_url')
      .eq('id', tr.event_id)
      .maybeSingle();

    const { data: tk } = await admin
      .from('tickets')
      .select('lot_id, seat_label')
      .eq('id', tr.ticket_id)
      .maybeSingle();

    let loteNome: string | null = null;
    if (tk?.lot_id) {
      const { data: lot } = await admin.from('event_lots').select('name').eq('id', tk.lot_id).maybeSingle();
      loteNome = lot?.name ?? null;
    }

    // Já existe conta com este CPF?
    //
    // Sem isto, quem recebe cai numa tela que só sabe CRIAR conta — e se já for
    // cliente, leva "já existe um e-mail assim" no fim do preenchimento, sem
    // saída (Gabriel, 21/08). O CPF é a chave certa: é ele que o remetente
    // apontou e é ele que trava o aceite.
    //
    // ⚠️ Não abre consulta de CPF para ninguém: só responde com um token de
    // transferência VÁLIDO em mãos, e quem tem o token já sabe o CPF, porque
    // foi o remetente que o digitou. E o e-mail sai mascarado — serve para a
    // pessoa se reconhecer, não para descobrir o endereço de alguém.
    let jaTemConta = false;
    let emailMascarado: string | null = null;
    try {
      const cpfLimpo = String(tr.to_cpf ?? '').replace(/\D/g, '');
      if (cpfLimpo.length === 11) {
        const { data: perfil } = await admin
          .from('profiles').select('id').eq('cpf', cpfLimpo).maybeSingle();
        if (perfil?.id) {
          jaTemConta = true;
          const { data: u } = await admin.auth.admin.getUserById(perfil.id);
          if (u?.user?.email) emailMascarado = maskEmail(u.user.email);
        }
      }
    } catch (e) {
      // Falhar aqui não pode travar o link: a pessoa segue pelo cadastro normal.
      console.log(`[TRANSFER-INFO] checagem de conta falhou - ${e instanceof Error ? e.message : String(e)}`);
    }

    return json({
      status: tr.status,
      expiraEm: tr.expires_at,
      deQuem: primeiroNome(tr.from_holder_name),
      jaTemConta,
      emailMascarado,
      // Só o final, para a pessoa conferir sem o link expor um CPF inteiro.
      cpfFinal: String(tr.to_cpf ?? '').slice(-3),
      evento: ev ? {
        titulo: ev.title, data: ev.date, hora: ev.time,
        local: ev.venue, cidade: ev.city, estado: ev.state, imagem: ev.image_url,
      } : null,
      ingresso: { lote: loteNome, assento: tk?.seat_label ?? null },
    });

  } catch (e) {
    console.log(`[TRANSFER-INFO] erro - ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: 'erro_interno' }, 500);
  }
});
