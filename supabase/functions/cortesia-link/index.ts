// Retirada de cortesia por LINK PÚBLICO (OS-313, Apresenta Summit 2026, 29/10).
//
// Por que existe: até aqui, cortesia só saía pela mão da casa (`admin-generate-courtesy-tickets`,
// exige admin) ou do colaborador na POS. O Summit pediu um link dedicado em que o próprio
// convidado retira o ingresso, cria a conta e cadastra a facial — decisão do Gabriel em 26/10.
//
// O que liga a retirada num evento é um lote ATIVO, de preço zero, com
// `event_lots.retirada_publica = true` (migration 20261030140000). A primeira versão olhava o
// NOME do lote, e a revisão mostrou o furo: bastava um produtor escrever esse nome no painel
// dele para abrir uma torneira de ingresso grátis no evento dele. Quem liga é a casa.
//
// A facial é OBRIGATÓRIA para retirar (decisão do Gabriel, 26/10/2026, repetida depois de
// eu levantar o parecer jurídico de 02/10, que desaconselha exigir biometria como única
// porta). Quem não cadastrou o rosto não recebe ingresso, e a trava mora aqui, não na tela.
//
// Regras que não se quebra:
//   • `orders.customer_cpf` é o ÚNICO campo que a `facial-checkin` consulta. Sem CPF no perfil,
//     a pessoa seria barrada na portaria como "sem_ingresso": aqui isso é erro, não aviso.
//   • Um CPF, uma cortesia por evento. A segunda chamada devolve o pedido que já existe
//     (idempotente), nunca um segundo ingresso.
//   • O estoque passa por `reserve_lot_quantity`, igual à venda: link aberto não fura lotação.
//   • Quem chama é o próprio convidado, com o JWT dele (a conta nasce na página). Nada de
//     anônimo emitindo ingresso.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendOrderConfirmationEmailSafe } from "../_shared/orderConfirmationEmail.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { validateCPF } from "../_shared/cpf.ts";
import { htmlAcompanhante, assuntoAcompanhante } from "./emailAcompanhante.ts";

// Ator do sistema nas auditorias (mesmo das outras edges).
const SYSTEM_ACTOR = "95628c4a-8040-44ed-83c5-d6a5b8793926";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const log = (event: string, data?: unknown) => {
  try {
    console.log(JSON.stringify({ scope: "cortesia_link", event, data: data ?? null }));
  } catch {
    console.log(`[cortesia_link] ${event}`);
  }
};

interface Evento {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  image_url: string | null;
  status: string;
}

/** Evento + lote do link, pelo slug. Erro de dado vira `sem_campanha`: o link não conta o porquê. */
async function carregar(admin: any, slug: string) {
  const { data: ev } = await admin
    .from("events")
    .select("id, title, date, time, venue, city, state, image_url, status")
    .eq("slug", slug)
    .maybeSingle();
  const evento = ev as Evento | null;
  if (!evento || evento.status !== "published") return null;

  const { data: lt } = await admin
    .from("event_lots")
    .select("id, name, total_quantity, sold_quantity, reserved_quantity, is_active, manually_sold_out, price, retirada_max_por_cpf")
    .eq("event_id", evento.id)
    .eq("retirada_publica", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const lote = lt as {
    id: string; name: string; total_quantity: number | null; sold_quantity: number | null;
    reserved_quantity: number | null; is_active: boolean; manually_sold_out: boolean | null; price: number | null;
    retirada_max_por_cpf: number | null;
  } | null;
  if (!lote || !lote.is_active) return null;
  // Lote com preço nunca sai de graça por aqui: produtor usa "Cortesia" com preço cheio
  // no painel, e distribuir estoque pago a R$ 0 estragaria o financeiro dele.
  if (Number(lote.price ?? 0) > 0) return null;
  // Sem teto o `reserve_lot_quantity` não reserva nada (compara com NULL): o link
  // mostraria "retirar" e entregaria "esgotado". Melhor não abrir.
  if (lote.total_quantity == null) return null;
  // Evento que já passou não entrega mais cortesia.
  if (evento.date < new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10)) return null;

  return { evento, lote };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let reservado = 0;
  let loteReservado: string | null = null;
  let pedidoCriado: string | null = null;

  try {
    const body = await req.json().catch(() => null) as {
      acao?: string; slug?: string;
      acompanhante?: { nome?: string; cpf?: string; email?: string } | null;
    } | null;
    const acao = body?.acao === "retirar" ? "retirar" : "info";
    const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!slug) return json({ ok: false, code: "slug_required" });

    // O IP é compartilhado: o Wi-Fi do hotel, o escritório do organizador e o CGNAT da
    // operadora põem a sala inteira atrás do mesmo número. Por isso o teto por IP é folgado
    // e a trava séria é por conta (abaixo, já com o usuário conhecido) e o índice único.
    const ip = getClientIp(req);
    const limite = await checkRateLimit(admin, `cortesia:${acao}:${ip}`, acao === "retirar" ? 40 : 400, 600, 300);
    if (!limite.allowed) return rateLimitResponse(limite, corsHeaders);

    const campanha = await carregar(admin, slug);
    if (!campanha) {
      log("sem_campanha", { slug });
      return json({ ok: false, code: "sem_campanha" });
    }
    const { evento, lote } = campanha;

    // Quantas ainda cabem. total_quantity nulo = sem teto (o lote segura pelo manually_sold_out).
    const usadas = (lote.sold_quantity ?? 0) + (lote.reserved_quantity ?? 0);
    const restam = lote.total_quantity == null ? null : Math.max(0, lote.total_quantity - usadas);
    const esgotado = lote.manually_sold_out === true || (restam !== null && restam <= 0);

    const infoEvento = {
      id: evento.id,
      titulo: evento.title,
      data: evento.date,
      hora: evento.time,
      local: evento.venue,
      cidade: evento.city,
      estado: evento.state,
      imagem: evento.image_url,
    };

    // Quantos ingressos cada CPF leva pelo link, contando o do acompanhante (OS-357).
    const maxPorCpf = Math.max(1, Math.min(2, Number(lote.retirada_max_por_cpf ?? 1)));

    if (acao === "info") {
      return json({ ok: true, evento: infoEvento, esgotado, restam, max_por_cpf: maxPorCpf });
    }

    // ---------------------------------------------------------------- retirar
    // Daqui para baixo, quem fala é o convidado logado.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    // Status 200 de propósito: `supabase.functions.invoke` lança em resposta não 2xx e o
    // front perderia o `code`, mostrando "erro interno" para sessão vencida.
    if (!token) return json({ ok: false, code: "sem_sessao" });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ ok: false, code: "sem_sessao" });

    const { data: perfilRaw } = await admin
      .from("profiles")
      .select("id, nome_completo, email, cpf, whatsapp, facial_photo_path, facial_synced_at")
      .eq("id", user.id)
      .maybeSingle();
    const perfil = perfilRaw as {
      id: string; nome_completo: string | null; email: string | null; cpf: string | null;
      whatsapp: string | null; facial_photo_path: string | null; facial_synced_at: string | null;
    } | null;

    const cpf = (perfil?.cpf ?? "").replace(/\D/g, "");
    // Sem CPF o ingresso não passa no check-in facial: é erro, não detalhe. E tem que ser
    // CPF de verdade: a `facial-checkin` casa pelo número exato, então 11 dígitos
    // quaisquer viram "sem_ingresso" na porta.
    if (!validateCPF(cpf)) return json({ ok: false, code: "sem_cpf" });

    // Trava de verdade da retirada: por conta, não por IP.
    const porConta = await checkRateLimit(admin, `cortesia:conta:${user.id}`, 8, 600, 600);
    if (!porConta.allowed) return rateLimitResponse(porConta, corsHeaders);

    // Sem rosto cadastrado não há ingresso (decisão do Gabriel, 26/10).
    if (!perfil?.facial_photo_path) return json({ ok: false, code: "sem_facial" });

    const email = (perfil?.email ?? user.email ?? "").trim().toLowerCase();
    if (!email) return json({ ok: false, code: "sem_email" });
    const nome = (perfil?.nome_completo ?? "").trim() || email.split("@")[0];

    // Acompanhante (OS-357): o 2º ingresso nasce no CPF, no nome e no e-mail dele, e ele
    // recebe o link para criar a conta e cadastrar a facial. Só no lote que permite 2.
    let acompanhante: { nome: string; cpf: string; email: string } | null = null;
    if (body?.acompanhante) {
      if (maxPorCpf < 2) return json({ ok: false, code: "sem_acompanhante" });
      const aNome = String(body.acompanhante.nome ?? "").trim().replace(/\s+/g, " ");
      const aCpf = String(body.acompanhante.cpf ?? "").replace(/\D/g, "");
      const aEmail = String(body.acompanhante.email ?? "").trim().toLowerCase();
      if (aNome.length < 3 || aNome.length > 120) return json({ ok: false, code: "acompanhante_nome" });
      if (!validateCPF(aCpf)) return json({ ok: false, code: "acompanhante_cpf" });
      if (aCpf === cpf) return json({ ok: false, code: "acompanhante_mesmo_cpf" });
      if (!EMAIL_RE.test(aEmail) || aEmail.length > 200) return json({ ok: false, code: "acompanhante_email" });
      acompanhante = { nome: aNome, cpf: aCpf, email: aEmail };
    }

    // Já retirou? Devolve o mesmo pedido, nunca um segundo ingresso. O `user_id` entra na
    // conta de propósito: quando isto foi escrito o CPF do perfil era editável pelo dono (hoje a
    // OS-267 trava), e casar só por CPF deixaria alguém digitar o CPF de um convidado e sair com o QR DELE (o
    // `ticket_code` é o payload cru lido na portaria).
    const { data: jaRaw } = await admin
      .from("orders")
      .select("id, status, user_id")
      .eq("event_id", evento.id)
      .eq("retirada_por_link", true)
      .in("status", ["paid", "pending"])
      .or(`customer_cpf.eq.${cpf},user_id.eq.${user.id}`)
      .order("created_at", { ascending: true })
      .limit(1);
    const ja = (jaRaw as Array<{ id: string; status: string; user_id: string | null }> | null)?.[0];
    if (ja) {
      if (ja.user_id !== user.id) {
        log("cpf_de_outra_conta", { order_id: ja.id });
        return json({ ok: false, code: "cpf_ja_retirou" });
      }
      // Pedido preso em `pending` (falha na emissão) não vira QR na tela: ele não passa
      // na portaria, e mostrar o código seria pior do que dizer que deu errado.
      if (ja.status !== "paid") return json({ ok: false, code: "retirada_incompleta" });
      const todosJa = await listarIngressos(admin, ja.id);
      const ingressos = paraATela(todosJa.filter((t) => !t.holder_cpf || t.holder_cpf === cpf));
      const doAcomp = todosJa.find((t) => t.holder_cpf && t.holder_cpf !== cpf);
      // O link do acompanhante foi aberto? (o envio do e-mail não fica gravado; o link, sim)
      let linkAberto = false;
      if (doAcomp) {
        const { data: tr } = await admin.from("ticket_transfers").select("id").eq("ticket_id", doAcomp.id).limit(1);
        linkAberto = (tr ?? []).length > 0;
      }
      log("ja_retirou", { order_id: ja.id });
      return json({
        ok: true, repetido: true, order_id: ja.id, ingressos, evento: infoEvento,
        acompanhante: doAcomp ? { email: mascararEmail(doAcomp.holder_email ?? ""), enviado: linkAberto } : null,
        // Pediu acompanhante agora, mas a retirada já tinha sido feita só para ela.
        acompanhante_nao_incluido: Boolean(body?.acompanhante) && !doAcomp,
      });
    }

    // Um CPF, um ingresso de link no evento, como quem retira OU como acompanhante. Sem
    // isto, quem já foi apontado como acompanhante retirava outro no próprio CPF (e o
    // rosto dele queimaria os dois), e um CPF podia ser acompanhante de duas pessoas.
    if (await cpfJaTemIngresso(admin, evento.id, cpf)) return json({ ok: false, code: "ja_e_acompanhante" });
    if (acompanhante && (
      await cpfJaTemIngresso(admin, evento.id, acompanhante.cpf)
      || await cpfJaRetirou(admin, evento.id, acompanhante.cpf)
    )) {
      return json({ ok: false, code: "acompanhante_ja_tem" });
    }

    const qtd = acompanhante ? 2 : 1;
    if (esgotado) return json({ ok: false, code: "esgotado" });
    // Sobrou uma vaga e a pessoa pediu duas: ela ainda pode retirar só a dela.
    if (restam !== null && restam < qtd) return json({ ok: false, code: "so_resta_um" });

    const { data: reserveOk, error: rErr } = await admin.rpc("reserve_lot_quantity", {
      _lot_id: lote.id,
      _qty: qtd,
    });
    if (rErr) throw new Error("reserve_failed:" + rErr.message);
    if (!reserveOk) return json({ ok: false, code: "esgotado" });
    reservado = qtd;
    loteReservado = lote.id;

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        event_id: evento.id,
        user_id: user.id,
        customer_name: nome,
        customer_email: email,
        customer_phone: (perfil?.whatsapp ?? "").replace(/\D/g, "") || null,
        customer_cpf: cpf,
        total_amount: 0,
        service_fee_amount: 0,
        discount_amount: 0,
        payment_method: "courtesy",
        status: "pending",
        sale_origin: "courtesy",
        manual_payment_method: null,
        // Marca da retirada pelo link (coluna da migration 20261030140000). É sobre ela
        // que corre o índice único "um CPF, uma cortesia por evento"; `sale_origin` fica
        // 'courtesy' para os relatórios que já contam cortesia continuarem contando.
        retirada_por_link: true,
        manual_payment_note: `Cortesia pelo link (${slug})`,
        manual_fee_applied: false,
        // Prazo curto de propósito: se a função morrer entre este insert e a emissão
        // (limite de tempo, deploy no meio, rede), o varredor `expire-pending-orders`
        // devolve a vaga sozinho. O `apply_order_approved` zera o prazo ao promover,
        // então a retirada que deu certo não é afetada.
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (orderErr && (orderErr as { code?: string }).code === "23505") {
      // Índice único da migration 20261030140000: duas chamadas do mesmo CPF ao mesmo tempo.
      // A que perdeu devolve a reserva e manda a pessoa recarregar.
      log("corrida_mesmo_cpf", { cpf_final: cpf.slice(-3) });
      await devolverReserva(admin, lote.id, qtd);
      reservado = 0;
      return json({ ok: false, code: "ja_retirou_agora" });
    }
    if (orderErr || !order) throw new Error("order_insert_failed:" + (orderErr?.message ?? "sem_linha"));
    pedidoCriado = order.id;

    const ingressosNovos: Array<Record<string, unknown>> = [{
      order_id: order.id,
      event_id: evento.id,
      lot_id: lote.id,
      holder_name: nome,
      holder_email: email,
      holder_phone: (perfil?.whatsapp ?? "").replace(/\D/g, "") || null,
      user_id: user.id,
      status: "pending",
    }];
    // O do acompanhante já nasce DELE (titular = CPF dele): é por esse CPF que a portaria
    // pela facial o reconhece. Fica na conta de quem retirou até ele aceitar pelo link.
    if (acompanhante) {
      ingressosNovos.push({
        order_id: order.id,
        event_id: evento.id,
        lot_id: lote.id,
        holder_name: acompanhante.nome,
        holder_email: acompanhante.email,
        holder_cpf: acompanhante.cpf,
        user_id: user.id,
        status: "pending",
      });
    }
    const { error: tErr } = await admin.from("tickets").insert(ingressosNovos);
    if (tErr && (tErr as { code?: string }).code === "23505") {
      // Trava do banco (migration 20261031160000): o CPF de quem retira ou do acompanhante
      // já tem ingresso grátis neste evento (corrida com outra retirada, ou transferência).
      log("um_por_cpf_banco", { order_id: order.id });
      const desfez = await desfazerPedido(admin, order.id);
      if (desfez) await devolverReserva(admin, lote.id, qtd);
      reservado = 0;
      pedidoCriado = null;
      return json({ ok: false, code: acompanhante ? "acompanhante_ja_tem" : "ja_e_acompanhante" });
    }
    if (tErr) throw new Error("tickets_insert_failed:" + tErr.message);

    const { data: applyData, error: applyErr } = await admin.rpc("apply_order_approved", {
      _order_id: order.id,
      _mp_payment_id: null,
    });
    // A RPC não lança quando recusa: ela devolve `{mismatch:true}` (pedido sem ingresso,
    // estado terminal). Sem olhar isso, a tela pintava o QR de um ingresso ainda pendente.
    const recusou = (applyData as { mismatch?: boolean } | null)?.mismatch === true;
    if (applyErr || recusou) {
      // Audita, cancela o pedido e os ingressos, devolve a vaga e deixa a pessoa tentar de
      // novo. Sem isto ela ficava trancada: a consulta de "já retirou" achava o pedido morto.
      await auditar(admin, "cortesia_link_falhou", order.id, {
        event_id: evento.id, lot_id: lote.id,
        erro: applyErr?.message ?? JSON.stringify(applyData),
      });
      const desfez = await desfazerPedido(admin, order.id);
      if (desfez) await devolverReserva(admin, lote.id, qtd);
      else log("pedido_ja_nao_estava_pendente", { order_id: order.id });
      reservado = 0;
      pedidoCriado = null;
      log("apply_order_approved_failed", { order_id: order.id, erro: applyErr?.message ?? "mismatch" });
      return json({ ok: false, code: "erro_interno" });
    }
    // A reserva virou venda; não devolver no caminho de erro, e o pedido está de pé.
    reservado = 0;
    pedidoCriado = null;

    await auditar(admin, "cortesia_link_retirada", order.id, {
      event_id: evento.id,
      event_title: evento.title,
      lot_id: lote.id,
      slug,
      // O CPF não vai para o log de auditoria (LGPD); só se tem, que é o que importa
      // para saber se aquela cortesia passa no check-in facial.
      has_cpf: true,
      com_facial: Boolean(perfil?.facial_photo_path),
      // Foto guardada não quer dizer rosto reconhecido: hoje 1 em cada 3 perfis com foto
      // está sem sincronizar. Fica registrado para a casa rodar o `facial-resync` na
      // véspera do evento, em quem retirou e está sem sync.
      facial_sincronizada: Boolean((perfil as { facial_synced_at?: string | null } | null)?.facial_synced_at),
    });

    const todos = await listarIngressos(admin, order.id);
    const ingressos = paraATela(todos.filter((t) => !t.holder_cpf || t.holder_cpf === cpf));

    // Link do acompanhante. Falha aqui não desfaz a retirada: o ingresso dele já existe no
    // CPF dele, e a casa reenvia pelo `ticket_transfers` (token e e-mail guardados).
    let acompanhanteInfo: { email: string; enviado: boolean } | null = null;
    if (acompanhante) {
      const dele = todos.find((t) => t.holder_cpf === acompanhante!.cpf);
      const enviado = dele
        ? await abrirLinkDoAcompanhante(admin, { ticketId: dele.id, eventoId: evento.id, eventoTitulo: evento.title, eventoData: evento.date, deUserId: user.id, deNome: nome, para: acompanhante })
        : false;
      acompanhanteInfo = { email: mascararEmail(acompanhante.email), enviado };
    }

    // E-mail com o QR. Nunca derruba a retirada: o ingresso já está na conta e na tela.
    let emailEnviado = false;
    try {
      const r = await sendOrderConfirmationEmailSafe(admin, { orderId: order.id, source: "cortesia_link" });
      emailEnviado = r.ok === true;
    } catch (e) {
      log("email_falhou", { error: String(e) });
    }

    log("ok", { order_id: order.id, com_facial: Boolean(perfil?.facial_photo_path), email: emailEnviado, acompanhante: Boolean(acompanhante) });
    return json({ ok: true, order_id: order.id, ingressos, evento: infoEvento, email_enviado: emailEnviado, acompanhante: acompanhanteInfo });
  } catch (e) {
    // Desfaz o que ficou pela metade. Sem isto, um tropeço entre o pedido e a emissão
    // (o insert dos ingressos, por exemplo) deixava um pedido `pending` que nunca expira
    // (cortesia não tem `expires_at`, e o varredor de pendentes só pega quem tem), e a
    // pessoa ficava trancada para sempre: a consulta de "já retirou" achava o pedido morto.
    // Desfaz o que ficou pela metade, e só devolve a vaga se o pedido ainda estava
    // pendente: pedido já pago quer dizer que a venda aconteceu e a vaga é dela.
    // (Se nem isto rodar, o `expires_at` de 10 minutos faz o varredor devolver depois.)
    let podeDevolver = reservado > 0;
    if (pedidoCriado) {
      await auditar(admin, "cortesia_link_falhou", pedidoCriado, { erro: String(e) });
      podeDevolver = await desfazerPedido(admin, pedidoCriado);
      if (!podeDevolver) log("pedido_ja_nao_estava_pendente", { order_id: pedidoCriado });
    }
    if (podeDevolver && reservado > 0 && loteReservado) {
      await devolverReserva(admin, loteReservado, reservado);
    }
    log("erro", { error: String(e) });
    return json({ ok: false, code: "erro_interno" }, 500);
  }
});

/**
 * Desfaz um pedido que ficou pela metade. Devolve `true` só se ELE cancelou o pedido,
 * isto é, se o pedido ainda estava `pending`. O guard `.eq('status','pending')` é o que
 * impede o pior caso: a RPC comitou no banco e só a resposta se perdeu, e aqui a edge
 * cancelaria um pedido PAGO e o ingresso válido da pessoa, além de devolver ao lote uma
 * vaga que já virou venda (comendo a reserva de quem está retirando ao mesmo tempo).
 */
async function desfazerPedido(admin: any, orderId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!data) return false;
    await admin.from("tickets").update({ status: "cancelled" }).eq("order_id", orderId).eq("status", "pending");
    return true;
  } catch (e) {
    log("cancelamento_falhou", { order_id: orderId, error: String(e) });
    return false;
  }
}

/** Devolve vaga reservada que não virou venda. Nunca lança: o caminho de erro já é o ruim. */
async function devolverReserva(admin: any, lotId: string, qty: number) {
  try {
    await admin.rpc("release_lot_quantity", { _lot_id: lotId, _qty: qty });
  } catch (e) {
    log("release_falhou", { error: String(e) });
  }
}

/** Auditoria da cortesia emitida pelo link. Falha de log nunca derruba a retirada. */
async function auditar(admin: any, action: string, orderId: string, metadata: unknown) {
  try {
    await admin.from("audit_logs").insert({
      actor_id: SYSTEM_ACTOR, action, target_type: "order", target_id: orderId, metadata,
    });
  } catch (e) {
    log("auditoria_falhou", { error: String(e) });
  }
}

async function listarIngressos(admin: any, orderId: string) {
  const { data } = await admin
    .from("tickets")
    .select("id, ticket_code, holder_name, holder_cpf, holder_email, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  // O CPF e o e-mail do titular servem só para separar o ingresso de quem retirou do
  // ingresso do acompanhante: saem da resposta antes de ir para a tela.
  return ((data ?? []) as Array<{
    id: string; ticket_code: string; holder_name: string; holder_cpf: string | null;
    holder_email: string | null; status: string;
  }>);
}

/** O que vai para a tela: sem CPF nem e-mail do titular. */
function paraATela(ts: Array<{ id: string; ticket_code: string; holder_name: string; status: string }>) {
  return ts.map(({ id, ticket_code, holder_name, status }) => ({ id, ticket_code, holder_name, status }));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mascararEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return "";
  return `${u.slice(0, 2)}***@${d}`;
}

/**
 * Este CPF já é titular de um ingresso GRÁTIS vivo do evento (de acompanhante ou recebido
 * por transferência)? Mesmo critério do gatilho `trg_um_ingresso_gratis_por_cpf`: só ingresso
 * de pedido do link e pedido vivo. Cortesia do produtor ou ingresso pago no mesmo CPF não
 * impedem retirar o grátis.
 */
async function cpfJaTemIngresso(admin: any, eventId: string, cpf: string): Promise<boolean> {
  const { data, error } = await admin
    .from("tickets")
    .select("id, orders!inner(status, retirada_por_link)")
    .eq("event_id", eventId)
    .eq("holder_cpf", cpf)
    .in("status", ["valid", "pending"])
    .eq("orders.retirada_por_link", true)
    .in("orders.status", ["paid", "pending"])
    .limit(1);
  if (error) throw new Error("consulta_titular:" + error.message);
  return (data ?? []).length > 0;
}

/** Este CPF já retirou pelo link neste evento? */
async function cpfJaRetirou(admin: any, eventId: string, cpf: string): Promise<boolean> {
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("event_id", eventId)
    .eq("retirada_por_link", true)
    .eq("customer_cpf", cpf)
    .in("status", ["paid", "pending"])
    .limit(1);
  if (error) throw new Error("consulta_retirada:" + error.message);
  return (data ?? []).length > 0;
}

/**
 * Abre a transferência do ingresso do acompanhante e manda o link por e-mail. É a
 * transferência de sempre (`/transferencia/<token>`, aceite pela RPC que confere o CPF),
 * gravada direto porque a RPC de início recusa ingresso cujo titular já é o destinatário,
 * e com prazo até o dia seguinte ao evento (a de sempre vale 24 h). Nunca lança.
 */
async function abrirLinkDoAcompanhante(admin: any, o: {
  ticketId: string; eventoId: string; eventoTitulo: string; eventoData: string;
  deUserId: string; deNome: string; para: { nome: string; cpf: string; email: string };
}): Promise<boolean> {
  try {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const expira = new Date(`${o.eventoData}T23:59:00-03:00`);
    expira.setDate(expira.getDate() + 1);
    const { data: tr, error } = await admin.from("ticket_transfers").insert({
      ticket_id: o.ticketId, event_id: o.eventoId, from_user_id: o.deUserId,
      from_holder_name: o.deNome, to_cpf: o.para.cpf, to_email: o.para.email,
      token, expires_at: expira.toISOString(),
    }).select("id").single();
    if (error || !tr) { log("transferencia_acompanhante_falhou", { error: error?.message }); return false; }
    await admin.from("audit_logs").insert({
      actor_id: o.deUserId, action: "ticket_transfer_started", target_type: "ticket", target_id: o.ticketId,
      metadata: { transfer_id: tr.id, to_cpf_final: o.para.cpf.slice(-3), origem: "acompanhante_cortesia_link" },
    }).then(() => {}, () => {});

    const chave = Deno.env.get("RESEND_API_KEY");
    if (!chave) { log("resend_nao_configurado", {}); return false; }
    const base = (Deno.env.get("SITE_PUBLIC_URL") || "https://festpag.digital").replace(/\/+$/, "");
    const url = `${base}/transferencia/${token}`;
    const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
    const { error: eErr } = await new Resend(chave).emails.send({
      from: "FestPag <naoresponda@festpag.com.br>",
      to: [o.para.email],
      subject: assuntoAcompanhante(o.eventoTitulo),
      html: htmlAcompanhante({ nomeAcompanhante: o.para.nome, quemRetirou: o.deNome, evento: o.eventoTitulo, url }),
    });
    if (eErr) { log("email_acompanhante_falhou", { error: String(eErr?.message ?? eErr) }); return false; }
    return true;
  } catch (e) {
    log("link_acompanhante_falhou", { error: String(e) });
    return false;
  }
}
