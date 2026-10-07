/*
 * aviso-relogio: o relógio que confere o PIX parou (ou voltou); o Gabriel tem
 * que ficar sabendo.
 *
 * POR QUE EXISTE (OS-158, 06/10/2026): a API do Marcel não tem webhook. Quem
 * confirma o PIX de quem pagou no app do banco e fechou a página é o relógio
 * `marcel-reconcile-every-min`. A OS-154 viu que ninguém saberia se ele parasse:
 * o banco perdia a resposta dele em toda rodada, e nada avisava.
 *
 * Quem chama: o vigia `vigiar_relogio_do_pix()` (pg_cron de 5 em 5 minutos), com
 * { alarme_id } de uma linha de `relogio_alarmes`. É o vigia que decide quando
 * abrir, lembrar ou fechar um incidente e quando tentar de novo; esta edge só
 * manda a mensagem e anota o que saiu. Admin logado também pode chamar, para
 * reenviar na mão.
 *
 * Para quem e por onde (decisão do Gabriel, 06/10): só ele, por WhatsApp e push,
 * o mesmo caminho do aviso de repasse.
 *   · WhatsApp: número do segredo AVISO_RELOGIO_WHATSAPP (ambiente ou Vault); sem
 *     ele, o AVISO_REPASSE_WHATSAPP, que é o celular do Gabriel.
 *   · Push e sino da gestão: `avisarGestao` com tipo 'relogio'. Do outro lado, a
 *     `alerta-produtos` manda tipo que não é de reembolso só para o dono
 *     (ALERTA_PRODUTOS_DESTINO, o Gabriel desde 18/08).
 * Um canal não segura o outro: se o WhatsApp está fora, o push ainda chega, e o
 * vigia tenta de novo só o que faltou.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { carregarConfigWhatsApp, enviarTextoWhatsApp, normalizarNumeroBr, mascararNumero } from '../_shared/whatsapp.ts';
import { avisarGestao } from '../_shared/avisarGestao.ts';
import { type Alarme, montarWhatsApp, montarPush } from './texto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const log = (passo: string, dados?: unknown) =>
  console.log(`[AVISO-RELOGIO] ${passo}${dados ? ' ' + JSON.stringify(dados) : ''}`);

/** Quem recebe no WhatsApp. Vault primeiro, para trocar sem deploy. */
// deno-lint-ignore no-explicit-any
async function destinosWhatsApp(admin: any): Promise<string[]> {
  let bruto = Deno.env.get('AVISO_RELOGIO_WHATSAPP') ?? '';
  for (const nome of ['AVISO_RELOGIO_WHATSAPP', 'AVISO_REPASSE_WHATSAPP']) {
    if (bruto) break;
    const { data } = await admin.rpc('ler_segredo', { _nome: nome });
    bruto = String(data ?? '');
  }
  return bruto.split(',').map((n) => normalizarNumeroBr(n)).filter((n): n is string => !!n);
}

/** Manda o alarme pelos canais que ainda não saíram e anota o resultado. */
// deno-lint-ignore no-explicit-any
async function avisar(admin: any, alarmeId: string) {
  const { data: linha, error } = await admin
    .from('relogio_alarmes')
    .select('id, tipo, created_at, dados, whatsapp_enviado_em, gestao_enviado_em')
    .eq('id', alarmeId)
    .maybeSingle();
  if (error || !linha) {
    log('alarme não encontrado', { alarmeId, erro: error?.message });
    return null;
  }

  const alarme: Alarme = { id: linha.id, tipo: linha.tipo, created_at: linha.created_at, dados: linha.dados ?? {} };
  const patch: Record<string, unknown> = {};
  const erros: string[] = [];

  // ── Canal 1: WhatsApp ────────────────────────────────────────────────────
  let whatsapp = !!linha.whatsapp_enviado_em;
  if (!whatsapp) {
    const temConfig = await carregarConfigWhatsApp(admin);
    const numeros = await destinosWhatsApp(admin);
    if (!temConfig || numeros.length === 0) {
      // Precisa gritar no log: sem isto, a casa acha que está sendo avisada.
      log('SEM CONFIGURAÇÃO DE WHATSAPP: o alarme não saiu', { alarmeId, temConfig, destinos: numeros.length });
      erros.push(temConfig ? 'whatsapp:sem_destino' : 'whatsapp:nao_configurado');
    } else {
      const texto = montarWhatsApp(alarme);
      for (const numero of numeros) {
        const r = await enviarTextoWhatsApp(numero, texto, { timeoutMs: 15_000 });
        if (r.ok) whatsapp = true;
        else erros.push(`whatsapp ${mascararNumero(numero)}:${r.erro}${'status' in r && r.status ? `/${r.status}` : ''}`);
      }
      patch.destino_whatsapp = numeros.map(mascararNumero).join(', ');
      if (whatsapp) patch.whatsapp_enviado_em = new Date().toISOString();
    }
  }

  // ── Canal 2: push e sino da gestão ───────────────────────────────────────
  let gestao = !!linha.gestao_enviado_em;
  if (!gestao) {
    const { titulo, mensagem } = montarPush(alarme);
    gestao = await avisarGestao({ tipo: 'relogio', titulo, mensagem, referencia: alarme.id });
    if (gestao) patch.gestao_enviado_em = new Date().toISOString();
    else erros.push('gestao:nao_recebeu');
  }

  patch.ultimo_erro = erros.length ? erros.join(' | ').slice(0, 500) : null;
  const { error: eUpd } = await admin.from('relogio_alarmes').update(patch).eq('id', alarmeId);
  if (eUpd) log('não consegui anotar o resultado', { alarmeId, erro: eUpd.message });

  log('avisado', { alarmeId, tipo: alarme.tipo, whatsapp, gestao });
  return { whatsapp, gestao };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Duas portas, iguais às do aviso-repasse:
  //   1) segredo compartilhado no X-Cron-Secret (o vigia)
  //   2) admin logado (reenviar na mão)
  let autorizado = false;
  const segredo = req.headers.get('x-cron-secret') ?? req.headers.get('X-Cron-Secret');
  if (segredo) {
    try {
      const { data: doVault } = await admin.rpc('get_cron_secret');
      if (doVault && segredo === doVault) autorizado = true;
    } catch (_) { /* segue para a porta do admin */ }
  }

  const authHeader = req.headers.get('Authorization');
  if (!autorizado && authHeader?.startsWith('Bearer ')) {
    try {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      const userId = claims?.claims?.sub;
      if (userId) {
        const { data: papeis } = await admin.from('user_roles').select('role').eq('user_id', userId);
        // deno-lint-ignore no-explicit-any
        if (papeis?.some((r: any) => r.role === 'admin')) autorizado = true;
      }
    } catch (_) { /* cai no 403 */ }
  }

  if (!autorizado) return json({ error: 'Forbidden' }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const alarmeId = body?.alarme_id;
    if (!alarmeId || typeof alarmeId !== 'string') return json({ ok: false, erro: 'alarme_id_ausente' }, 400);

    const r = await avisar(admin, alarmeId);
    if (!r) return json({ ok: false, erro: 'alarme_nao_encontrado' }, 404);
    return json({ ok: true, ...r });
  } catch (e) {
    // Quem chama é o banco e não lê a resposta: o log é o único lugar onde este
    // erro existe. O vigia tenta de novo na próxima rodada.
    log('exceção', { msg: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, erro: 'erro_interno' }, 500);
  }
});
