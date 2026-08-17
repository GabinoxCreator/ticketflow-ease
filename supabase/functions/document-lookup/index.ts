// document-lookup — consulta CPF/CNPJ na API do Marcel para o cadastro de produtor.
//
// PARA QUE SERVE
//   No cadastro (/area-do-produtor/cadastro) o produtor digita CPF ou CNPJ. Esta função
//   confere se o documento EXISTE de verdade e devolve o nome/razão social para preencher
//   o passo seguinte. Objetivo do Gabriel (17/08/2026): encurtar o cadastro e conferir
//   dado real, em vez de aceitar qualquer nome digitado.
//
// POR QUE ESTA FUNÇÃO EXISTE EM VEZ DE O FRONT CHAMAR O MARCEL DIRETO
//   1. A URL da API mora em SECRET (`MARCEL_DOC_BASE`) e nunca vai para o bundle — mesmo
//      padrão do `totem-lookup-cpf`. A API do Marcel não tem autenticação nenhuma, então
//      publicar o endereço dela seria entregar consulta ilimitada a qualquer um.
//   2. Esta página é PÚBLICA (verify_jwt=false, tem que ser: quem se cadastra ainda não
//      tem conta). Sem um intermediário nosso, viraria consulta aberta de documento.
//      Daí o rate limit por IP abaixo — é ele que separa "cadastro" de "varredura".
//
// PRIVACIDADE (regras da casa)
//   · POST com o documento no BODY, nunca em query string: `?ni=123` fica gravado em log
//     de acesso de todo intermediário do caminho. É a diferença mais barata que existe.
//   · NUNCA logar documento nem nome. O log leva só os 3 últimos dígitos.
//   · Minimização: o CNPJ do Marcel devolve endereço completo, CNAE etc. Devolvemos APENAS
//     os campos que o formulário realmente usa. Campo sem uso concreto não é coletado.
//   · Falha da API nunca trava o cadastro: devolve ok:false e a pessoa digita na mão.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { validateCNPJ, unformatCNPJ } from "../_shared/cnpj.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOOKUP_TIMEOUT_MS = 10_000;

// Um cadastro honesto faz 1 ou 2 consultas (erra o número uma vez, corrige). 8 em 10
// minutos cobre isso com folga e ainda assim torna varredura inviável. Fail-closed:
// se o rate limit estiver fora do ar, a função bloqueia (503) em vez de liberar geral.
const RL_MAX = 8;
const RL_WINDOW_SECONDS = 600;
const RL_BLOCK_SECONDS = 900;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Só os 3 últimos dígitos vão para o log — o bastante para casar com um relato de suporte
// ("terminava em 456"), longe de identificar alguém.
const tail = (digits: string) => digits.length >= 3 ? `***${digits.slice(-3)}` : '***';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const type = String((body as { type?: string }).type ?? '').toLowerCase();
    const raw = String((body as { document?: string }).document ?? '');

    if (type !== 'cpf' && type !== 'cnpj') return json({ ok: false, reason: 'bad_request' }, 400);

    // Valida o dígito verificador ANTES de qualquer chamada externa. Documento inventado
    // nem chega a virar consulta — corta a maior parte do abuso de graça e não gasta a
    // API do Marcel com lixo.
    const digits = type === 'cpf' ? unformatCPF(raw) : unformatCNPJ(raw);
    const valid = type === 'cpf' ? validateCPF(digits) : validateCNPJ(digits);
    if (!valid) return json({ ok: false, reason: 'invalid_document' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const ip = getClientIp(req);
    const rl = await checkRateLimit(
      supabase, `doclookup:${ip}`, RL_MAX, RL_WINDOW_SECONDS, RL_BLOCK_SECONDS,
    );
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    // Ausente = integração não configurada. Não é erro do usuário: devolve indisponível
    // e o formulário segue no preenchimento manual.
    const base = Deno.env.get('MARCEL_DOC_BASE');
    if (!base) {
      console.warn('[document-lookup] MARCEL_DOC_BASE ausente — cadastro segue manual');
      return json({ ok: false, reason: 'unavailable' });
    }

    const url = type === 'cnpj'
      ? `${base}/cnpj?ni=${digits}&tipo=basica`
      : `${base}/cpf?ni=${digits}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        console.warn('[document-lookup] upstream', type, tail(digits), resp.status);
        return json({ ok: false, reason: 'not_found' });
      }

      const data = await resp.json();
      // `aprovado` quer dizer "achei o documento", NÃO "está regular". Não afirmar situação
      // cadastral em cima disso.
      if (data?.aprovado !== true) return json({ ok: false, reason: 'not_found' });

      if (type === 'cpf') {
        const name = typeof data?.nome === 'string' ? data.nome.trim() : '';
        if (!name) return json({ ok: false, reason: 'not_found' });
        // Só o nome. A API devolve nascimento; o cadastro de produtor não tem esse campo
        // nem usa a data para nada, então não passa daqui.
        return json({ ok: true, type: 'cpf', data: { legal_name: name } });
      }

      const d = data?.data ?? {};
      const legalName = typeof d?.nomeEmpresarial === 'string' ? d.nomeEmpresarial.trim() : '';
      if (!legalName) return json({ ok: false, reason: 'not_found' });

      const phone = d?.telefones?.[0];
      return json({
        ok: true,
        type: 'cnpj',
        data: {
          legal_name: legalName,
          trade_name: typeof d?.nomeFantasia === 'string' ? d.nomeFantasia.trim() : null,
          contact_email: typeof d?.correioEletronico === 'string'
            ? d.correioEletronico.trim().toLowerCase() : null,
          contact_phone: phone?.ddd && phone?.numero ? `${phone.ddd}${phone.numero}` : null,
        },
      });
    } catch (_) {
      // Timeout, rede fora ou JSON inesperado. Silencioso de propósito: o catch não pode
      // vazar documento nem nome para o log.
      console.warn('[document-lookup] falha na consulta', type, tail(digits));
      return json({ ok: false, reason: 'unavailable' });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('[document-lookup] erro', e instanceof Error ? e.message : String(e));
    return json({ ok: false, reason: 'internal_error' }, 500);
  }
});
