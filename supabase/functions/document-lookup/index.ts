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
//
// FICHA DE CONFERÊNCIA (OS-338, 28/10/2026)
//   Quando a base ACHA o documento, a resposta leva também `conferencia`: o número de
//   uma ficha gravada no banco (`registrar_conferencia_de_documento`, só service_role),
//   que a tela manda no cadastro. É ela que diz ao banco que a base oficial ENCONTROU
//   aquele documento (não que ele é de quem se cadastra: esta consulta é pública):
//   sem ficha (chamada direta, que pula a tela), a produtora nasce com o documento
//   "pendente de conferência". A ficha vale 2 horas e serve uma vez (o banco guarda o
//   sha256 do documento, sem segredo, numa tabela que só a casa lê). Se gravar a ficha
//   falhar, a resposta sai igual à de antes, sem `conferencia` (a produtora fica
//   pendente).
//
// CPF COM DATA DE NASCIMENTO (OS-339, 28/10/2026)
//   A consulta de CPF do Marcel passou a exigir a data de nascimento junto do CPF
//   (o Gabriel falou com ele em 28/10). A tela manda `birth_date` ('aaaa-mm-dd') e
//   esta função repassa no formato que a API espera. Nome do parâmetro e formato
//   moram num lugar só, `NASCIMENTO_NA_CONSULTA` abaixo: se o Marcel disser outro,
//   é trocar ali e fazer o redeploy desta função. A data não é gravada nem logada do
//   nosso lado; vai na URL da base do Marcel, como o CPF já vai. Serve só para a consulta.
//   E a função agora separa duas coisas que antes saíam iguais ("não encontrado"):
//     not_found   -> a base respondeu e disse que não achou (trava o Continuar)
//     unavailable -> a base não respondeu, ou respondeu algo que não é resposta de
//                    consulta (erro, versão descontinuada, formato que ela recusou).
//                    Não trava: a produtora segue e fica pendente de conferência.
//   Em 28/10 a rota de CPF respondia 410 "Esta versão da API Consulta CPF foi
//   descontinuada", e isso virava "não encontrado" e travava o cadastro de pessoa física.

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

// Como a data de nascimento vai para a consulta de CPF do Marcel. [A CONFIRMAR com o
// Marcel] nome do parâmetro e formato: em 28/10 nenhuma combinação foi aceita (a rota
// ainda respondia 410 para todas), então este é o palpite mais provável, no padrão do
// campo `nascimento` que a própria API devolve. Trocar SÓ aqui.
const NASCIMENTO_NA_CONSULTA = {
  parametro: 'nascimento',
  // recebe 'aaaa-mm-dd' (já conferida) e devolve o texto que vai na URL
  formatar: (iso: string) => {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  },
};

// 'aaaa-mm-dd' de uma data que existe, não é futura e não é antes de 1900.
function nascimentoValido(iso: string): boolean {
  if (iso.length !== 10 || iso[4] !== '-' || iso[7] !== '-') return false;
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return false;
  }
  return ano >= 1900 && data.getTime() <= Date.now();
}

// Lê a resposta da base e diz o que ela quer dizer. Regra: só é "não achou" quando a
// base RESPONDEU a consulta e disse que não achou: 404 com o corpo da consulta
// (`{"aprovado":false,"message":"Not Found"}`, visto no CNPJ em 28/10) ou 200 com
// aprovado diferente de true. Qualquer outra coisa (5xx, 410 de versão descontinuada,
// 400 de pedido que ela recusou, 429, 404 de rota que não existe, que vem em HTML,
// corpo que não é JSON, e erro de texto com QUALQUER status: corpo picado, `error`
// preenchido, `message` que não seja "Not Found") é "não respondeu": não trava ninguém.
type Leitura =
  | { tipo: 'achou'; data: Record<string, unknown> }
  | { tipo: 'nao_achou' }
  | { tipo: 'nao_respondeu'; motivo: string };

async function lerResposta(resp: Response): Promise<Leitura> {
  if (resp.status !== 200 && resp.status !== 404) {
    return { tipo: 'nao_respondeu', motivo: `http ${resp.status}` };
  }
  let data: unknown;
  try {
    data = await resp.json();
  } catch (_) {
    return { tipo: 'nao_respondeu', motivo: `http ${resp.status} corpo nao e json` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { tipo: 'nao_respondeu', motivo: 'corpo vazio' };
  }
  const d = data as Record<string, unknown>;
  // Erro de TEXTO da base vem antes de qualquer regra de status (revisão 1 da OS-339):
  // se um dia ele chegar com 404 ou 200, não pode virar "não achou" e travar todo CPF.
  //   · corpo picado: a base espalha uma frase em chaves "0", "1", "2"... (é assim que
  //     veio o 410 "versão descontinuada" em 28/10: {"0":"E","1":"s",...,"aprovado":false});
  //   · `error` preenchido: é o campo que ela usa em "CPF inválido" e "parâmetro
  //     obrigatório", ou seja, não processou o pedido;
  //   · `message` com qualquer recado que não seja "Not Found" (revisão 2): "Parâmetro
  //     nascimento obrigatório", "Data de nascimento divergente", versão descontinuada...
  //     O único "não achei" que conhecemos da base é 404 `{"aprovado":false,"message":
  //     "Not Found"}` (CNPJ, base real, 28/10). Recado desconhecido não trava ninguém:
  //     a produtora segue pendente e o recado (texto da base, não dado da pessoa) vai
  //     para o log, para a casa ver o que mudou.
  if (typeof d['0'] === 'string') return { tipo: 'nao_respondeu', motivo: `http ${resp.status} corpo picado` };
  if (typeof d.error === 'string' && d.error.trim() !== '') {
    return { tipo: 'nao_respondeu', motivo: `http ${resp.status} base recusou o pedido: ${d.error.trim().slice(0, 60)}` };
  }
  if (d.message !== undefined && d.message !== null) {
    const recado = String(d.message).trim();
    if (recado !== '' && recado.toLowerCase() !== 'not found') {
      return { tipo: 'nao_respondeu', motivo: `http ${resp.status} recado da base: ${recado.slice(0, 60)}` };
    }
  }
  if (resp.status === 404) {
    return d.aprovado === false ? { tipo: 'nao_achou' } : { tipo: 'nao_respondeu', motivo: 'http 404' };
  }
  // `aprovado` quer dizer "achei o documento", NÃO "está regular".
  if (d.aprovado === true) return { tipo: 'achou', data: d };
  return { tipo: 'nao_achou' };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Só os 3 últimos dígitos vão para o log — o bastante para casar com um relato de suporte
// ("terminava em 456"), longe de identificar alguém.
const tail = (digits: string) => digits.length >= 3 ? `***${digits.slice(-3)}` : '***';

// Ficha de conferência (OS-338). Nunca lança: sem ficha, a resposta sai como antes.
// deno-lint-ignore no-explicit-any
async function gravarFicha(supabase: any, digits: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('registrar_conferencia_de_documento', { _documento: digits });
    if (error || typeof data !== 'string') {
      console.warn('[document-lookup] ficha de conferência não gravada', tail(digits));
      return null;
    }
    return data;
  } catch (_) {
    console.warn('[document-lookup] ficha de conferência não gravada', tail(digits));
    return null;
  }
}

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

    // Data de nascimento (OS-339): só no CPF. Se veio, tem que ser uma data de verdade
    // em 'aaaa-mm-dd'; se não veio (tela antiga em cache), a consulta vai sem ela e a
    // base decide (hoje ela recusa, e isso vira `unavailable`, que não trava).
    const nascimentoRaw = (body as { birth_date?: unknown }).birth_date;
    let nascimento: string | null = null;
    if (type === 'cpf' && nascimentoRaw !== undefined && nascimentoRaw !== null && nascimentoRaw !== '') {
      const iso = String(nascimentoRaw).trim();
      if (!nascimentoValido(iso)) return json({ ok: false, reason: 'invalid_birth_date' }, 400);
      nascimento = iso;
    }

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

    let url: string;
    if (type === 'cnpj') {
      url = `${base}/cnpj?ni=${digits}&tipo=basica`;
    } else {
      url = `${base}/cpf?ni=${digits}`;
      if (nascimento) {
        url += `&${NASCIMENTO_NA_CONSULTA.parametro}=${encodeURIComponent(NASCIMENTO_NA_CONSULTA.formatar(nascimento))}`;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      const leitura = await lerResposta(resp);
      if (leitura.tipo === 'nao_respondeu') {
        // Não é "não achou": a base não deu resposta de consulta. Não trava o cadastro.
        console.warn('[document-lookup] base nao respondeu', type, tail(digits), leitura.motivo,
          type === 'cpf' ? (nascimento ? 'com nascimento' : 'sem nascimento') : '');
        return json({ ok: false, reason: 'unavailable' });
      }
      if (leitura.tipo === 'nao_achou') {
        console.warn('[document-lookup] nao encontrado', type, tail(digits), resp.status);
        return json({ ok: false, reason: 'not_found' });
      }
      // deno-lint-ignore no-explicit-any
      const data: any = leitura.data;

      if (type === 'cpf') {
        const name = typeof data?.nome === 'string' ? data.nome.trim() : '';
        // Achou sem nome é resposta estranha, não "não existe": não trava.
        if (!name) return json({ ok: false, reason: 'unavailable' });
        // Só o nome. A API devolve nascimento; a data que a pessoa digitou serviu só
        // para a consulta e não passa daqui.
        const conferencia = await gravarFicha(supabase, digits);
        return json({ ok: true, type: 'cpf', data: { legal_name: name }, ...(conferencia ? { conferencia } : {}) });
      }

      const d = data?.data ?? {};
      const legalName = typeof d?.nomeEmpresarial === 'string' ? d.nomeEmpresarial.trim() : '';
      // Achou sem razão social é resposta estranha, não "não existe": não trava.
      if (!legalName) return json({ ok: false, reason: 'unavailable' });

      const phone = d?.telefones?.[0];
      const conferencia = await gravarFicha(supabase, digits);
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
        ...(conferencia ? { conferencia } : {}),
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
