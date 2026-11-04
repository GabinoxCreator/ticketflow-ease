// ingresso-convidado — o comprador diz para quem é cada ingresso a mais, e nós mandamos o
// link ao convidado por e-mail (OS-372, 03/11/2026).
//
// Pedido do Gabriel: "a gente apontar cada ingresso para seu convidado e ele ter o link da
// facial, a gente mandar pelo email ou whatsapp". É a transferência de sempre por baixo
// (`/transferencia/<token>`, aceite pelo CPF), aberta pela RPC `apontar_convidado_ingresso`,
// que confere o pedido (site, pago, 2+ ingressos, sem lista de alunos nem retirada grátis),
// o CPF (um por evento) e chama `iniciar_transferencia_ingresso`.
//
// Três ações, sempre com o usuário tirado da sessão, nunca de um id vindo do navegador:
//   · pedidos  { orderIds }                         → o que a tela mostra de cada pedido
//   · apontar  { ticketId, nome, cpf, email, telefone } → abre o convite e manda o e-mail
//   · reenviar { transferId }                       → manda o e-mail de novo (1 a cada 10 min)
//
// O WhatsApp é do comprador (decisão do Gabriel, 03/11): a tela abre o `wa.me` com o link.
// Nada sai pelo WhatsApp da FestPag.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { assuntoConvidado, htmlConvidado } from "./emailConvidado.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const log = (step: string, d?: unknown) =>
  console.log(`[INGRESSO-CONVIDADO] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

// O que o comprador lê. Os da transferência são os mesmos do `ticket-transfer-start`.
const RECADOS: Record<string, string> = {
  pedido_sem_convidado: 'Este pedido não tem a opção de convidado. Use o Transferir no ingresso.',
  cpf_ja_tem_ingresso: 'Este CPF já tem ingresso (ou um convite aberto) para este evento.',
  ingresso_nao_e_seu: 'Este ingresso não está na sua conta.',
  ingresso_indisponivel: 'Este ingresso não está mais válido.',
  compra_nao_confirmada: 'A compra ainda não foi confirmada. Assim que o pagamento entrar, você poderá apontar o convidado.',
  ingresso_ja_utilizado: 'Este ingresso já foi utilizado na entrada.',
  ingresso_ja_transferido: 'Este ingresso já foi transferido uma vez. Quem recebeu não pode repassar adiante.',
  transferencia_em_andamento: 'Este ingresso já tem um convite aberto. Cancele o atual para apontar outra pessoa.',
  cpf_do_proprio_dono: 'Este CPF é o seu. Informe o CPF do convidado.',
  ingresso_em_reembolso: 'Este ingresso tem um pedido de reembolso em análise e está bloqueado.',
  cpf_invalido: 'CPF inválido. Confira e tente de novo.',
  ingresso_nao_encontrado: 'Ingresso não encontrado.',
};

function recado(erro: string): string {
  for (const [chave, texto] of Object.entries(RECADOS)) {
    if (erro.includes(chave)) return texto;
  }
  return 'Não foi possível apontar o convidado. Tente novamente.';
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REENVIO_MIN = 10;

const baseDoSite = () => (Deno.env.get('SITE_PUBLIC_URL') || 'https://festpag.digital').replace(/\/+$/, '');
const linkDo = (token: string) => `${baseDoSite()}/transferencia/${token}`;

/** "2026-11-20" → "20/11". */
const diaMes = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : null);

/** Manda o convite. Nunca lança: o convite já existe, e sem e-mail o comprador ainda tem o WhatsApp. */
async function mandarEmail(admin: any, tr: {
  id: string; token: string; to_email: string | null; to_name: string | null;
  from_holder_name: string | null; expires_at: string; event_id: string;
}): Promise<boolean> {
  try {
    if (!tr.to_email) return false;
    const chave = Deno.env.get('RESEND_API_KEY');
    if (!chave) { log('resend_nao_configurado'); return false; }
    const { data: ev } = await admin.from('events').select('title, date').eq('id', tr.event_id).maybeSingle();
    const evento = ev?.title ?? 'evento';
    const Resend = (await import('https://esm.sh/resend@2.0.0')).Resend;
    const { error } = await new Resend(chave).emails.send({
      from: 'FestPag <naoresponda@festpag.com.br>',
      to: [tr.to_email],
      subject: assuntoConvidado({ quemComprou: tr.from_holder_name ?? '', evento }),
      html: htmlConvidado({
        nomeConvidado: tr.to_name ?? '', quemComprou: tr.from_holder_name ?? '', evento,
        dataEvento: diaMes(ev?.date ?? null), url: linkDo(tr.token), expiraEm: tr.expires_at,
      }),
    });
    if (error) { log('email_falhou', { transferId: tr.id, error: String(error?.message ?? error) }); return false; }
    await admin.from('ticket_transfers').update({ aviso_enviado_em: new Date().toISOString() }).eq('id', tr.id);
    return true;
  } catch (e) {
    log('email_falhou', { transferId: tr.id, error: String(e) });
    return false;
  }
}

/** O que a tela mostra de cada pedido do comprador. */
async function pedidos(admin: any, userId: string, orderIds: string[]) {
  const ids = Array.from(new Set(orderIds.filter((x) => typeof x === 'string'))).slice(0, 30);
  if (ids.length === 0) return [];

  const { data: ords } = await admin
    .from('orders')
    .select('id, event_id, status, sale_origin, retirada_por_link, user_id')
    .in('id', ids);
  const { data: tks } = await admin
    .from('tickets')
    .select('id, order_id, user_id, status, validated_at, created_at, lot:event_lots(name), seat:event_seats(label)')
    .in('order_id', ids)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const ticketIds = (tks ?? []).map((t: any) => t.id);
  const { data: trs } = ticketIds.length
    ? await admin
        .from('ticket_transfers')
        .select('id, ticket_id, status, origem, to_name, to_cpf, to_email, to_phone, token, expires_at, aviso_enviado_em, from_user_id, created_at')
        .in('ticket_id', ticketIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  const eventIds = Array.from(new Set((ords ?? []).map((o: any) => o.event_id)));
  const { data: listas } = eventIds.length
    ? await admin.from('listas_alunos_eventos').select('event_id').in('event_id', eventIds)
    : { data: [] };
  const comLista = new Set((listas ?? []).map((l: any) => l.event_id));
  const { data: evs } = eventIds.length
    ? await admin.from('events').select('id, title').in('id', eventIds)
    : { data: [] };
  const tituloDo = new Map((evs ?? []).map((e: any) => [e.id, e.title]));
  const agora = Date.now();

  return (ords ?? []).map((o: any) => {
    const doPedido = (tks ?? []).filter((t: any) => t.order_id === o.id);
    // Só quem tem (ou teve) ingresso deste pedido enxerga o pedido aqui.
    const meus = doPedido.filter((t: any) =>
      t.user_id === userId || (trs ?? []).some((tr: any) => tr.ticket_id === t.id && tr.from_user_id === userId));
    const validos = doPedido.filter((t: any) => t.status === 'valid');
    const elegivel = meus.length > 0
      && o.status === 'paid' && o.sale_origin === 'online' && !o.retirada_por_link
      && validos.length >= 2 && !comLista.has(o.event_id);
    if (!elegivel) return { orderId: o.id, elegivel: false, ingressos: [] };

    const ingressos = meus.map((t: any) => {
      const dele = (trs ?? []).filter((tr: any) => tr.ticket_id === t.id);
      const aceita = dele.find((tr: any) => tr.status === 'aceita');
      const aberta = dele.find((tr: any) => tr.status === 'pendente' && new Date(tr.expires_at).getTime() > agora);
      const rotulo = t.seat?.label ?? t.lot?.name ?? 'Ingresso';
      if (aceita) {
        // Quem RECEBEU este ingresso não vê nada dele aqui: não repassa adiante.
        if (aceita.from_user_id !== userId) return null;
        return { id: t.id, rotulo, estado: 'transferido', convidado: { nome: aceita.to_name, cpfFinal: String(aceita.to_cpf).slice(-3) } };
      }
      if (t.user_id !== userId) return null;
      // Ingresso que passou na portaria fica `used`: é o do comprador, que já entrou.
      if (t.status === 'used' || t.validated_at) return { id: t.id, rotulo, estado: 'usado' };
      if (t.status !== 'valid') return { id: t.id, rotulo, estado: 'indisponivel' };
      if (aberta) {
        return {
          id: t.id, rotulo,
          estado: aberta.origem === 'convidado' ? 'convite' : 'transferindo',
          convidado: aberta.origem === 'convidado'
            ? {
                transferId: aberta.id, nome: aberta.to_name, cpfFinal: String(aberta.to_cpf).slice(-3),
                email: aberta.to_email, telefone: aberta.to_phone, expiraEm: aberta.expires_at,
                avisoEnviadoEm: aberta.aviso_enviado_em, link: linkDo(aberta.token),
              }
            : { cpfFinal: String(aberta.to_cpf).slice(-3) },
        };
      }
      return { id: t.id, rotulo, estado: 'livre' };
    }).filter(Boolean);

    return { orderId: o.id, elegivel: true, evento: tituloDo.get(o.event_id) ?? null, ingressos };
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Faça login para continuar.' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return json({ error: 'Faça login para continuar.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao ?? '');

    if (acao === 'pedidos') {
      const lista = Array.isArray(body?.orderIds) ? body.orderIds : [];
      return json({ ok: true, pedidos: await pedidos(admin, userId, lista) });
    }

    if (acao === 'apontar') {
      const { ticketId } = body;
      const nome = String(body?.nome ?? '').trim().slice(0, 120);
      const cpf = unformatCPF(String(body?.cpf ?? ''));
      const email = String(body?.email ?? '').trim().toLowerCase();
      const telefone = String(body?.telefone ?? '').replace(/\D/g, '');
      if (!ticketId) return json({ error: 'Ingresso não informado.' }, 400);
      if (nome.length < 2) return json({ error: 'Informe o nome do convidado.' }, 400);
      if (!validateCPF(cpf)) return json({ error: 'CPF inválido. Confira e tente de novo.' }, 400);
      if (!EMAIL_OK.test(email)) return json({ error: 'E-mail inválido. Confira e tente de novo.' }, 400);
      if (telefone.length < 10 || telefone.length > 11) return json({ error: 'Celular inválido. Informe com o DDD.' }, 400);

      // Cada convite manda um e-mail nosso e responde se um CPF tem ingresso no evento:
      // sem limite, cancelar e apontar de novo virava disparo de e-mail e consulta de CPF.
      // Por conta, fail-closed (sem o contador, não abre convite).
      const limite = await checkRateLimit(admin, `convidado:conta:${userId}`, 10, 900, 900);
      if (!limite.allowed) {
        return limite.unavailable
          ? json({ error: 'Não foi possível conferir agora. Tente de novo em instantes.' }, 503)
          : json({ error: 'Muitos convites seguidos. Espere alguns minutos e tente de novo.' }, 429);
      }

      // Token do link: aleatório e sem significado, igual ao da transferência de sempre.
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const { data, error } = await admin.rpc('apontar_convidado_ingresso', {
        _ticket_id: ticketId, _user_id: userId, _to_cpf: cpf, _to_nome: nome,
        _to_email: email, _to_phone: telefone, _token: token,
      });
      if (error) {
        log('Recusado', { userId, msg: error.message });
        return json({ error: recado(error.message || '') }, 409);
      }

      const { data: tr } = await admin
        .from('ticket_transfers')
        .select('id, token, to_email, to_name, from_holder_name, expires_at, event_id')
        .eq('id', data?.transfer_id)
        .maybeSingle();
      const emailEnviado = tr ? await mandarEmail(admin, tr) : false;
      await admin.from('audit_logs').insert({
        actor_id: userId, action: 'ticket_guest_assigned', target_type: 'ticket', target_id: ticketId,
        metadata: { transfer_id: data?.transfer_id, to_cpf_final: cpf.slice(-3), expires_at: data?.expires_at, email_enviado: emailEnviado },
      }).then(() => {}, () => {});
      log('Convidado apontado', { ticketId, transferId: data?.transfer_id, emailEnviado });

      return json({ ok: true, transferId: data?.transfer_id, expiresAt: data?.expires_at, link: linkDo(token), emailEnviado });
    }

    if (acao === 'reenviar') {
      const { transferId } = body;
      if (!transferId) return json({ error: 'Convite não informado.' }, 400);
      const { data: tr } = await admin
        .from('ticket_transfers')
        .select('id, token, to_email, to_name, from_holder_name, expires_at, event_id, status, origem, from_user_id, aviso_enviado_em')
        .eq('id', transferId)
        .maybeSingle();
      if (!tr || tr.from_user_id !== userId || tr.origem !== 'convidado') return json({ error: 'Convite não encontrado.' }, 404);
      if (tr.status !== 'pendente' || new Date(tr.expires_at).getTime() <= Date.now()) {
        return json({ error: 'Este convite não está mais aberto. Aponte o convidado de novo.' }, 409);
      }
      if (tr.aviso_enviado_em && Date.now() - new Date(tr.aviso_enviado_em).getTime() < REENVIO_MIN * 60_000) {
        return json({ error: `O e-mail acabou de sair. Espere ${REENVIO_MIN} minutos para mandar de novo, ou mande pelo WhatsApp.` }, 429);
      }
      const emailEnviado = await mandarEmail(admin, tr);
      log('Reenvio', { transferId, emailEnviado });
      return json({ ok: true, emailEnviado, link: linkDo(tr.token) });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    return json({ error: 'Não foi possível concluir agora. Tente novamente.' }, 500);
  }
});
