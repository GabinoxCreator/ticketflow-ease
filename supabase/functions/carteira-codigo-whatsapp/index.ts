import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { carregarConfigWhatsApp, enviarCodigoWhatsApp, mascararNumero, normalizarNumeroBr } from '../_shared/whatsapp.ts';

// ============================================================
// carteira-codigo-whatsapp: o carteiro do FaceCashless (OS-209, 13/10/2026).
//
// O FaceCashless não tem WhatsApp próprio. Quando alguém que já tem carteira
// (criada no totem, com e-mail inventado) precisa provar que é dono dela, a
// carteira gera o código e pede para o site entregar, pelo mesmo caminho do
// código de acesso do site: API oficial da Meta quando ligada (OS-174), senão
// a Evolution.
//
// Esta função NÃO gera nem confere código: quem guarda o hash e confere é a
// carteira. Aqui só entra número + código e sai a mensagem.
//
// Quem chama: só o backend do FaceCashless, com o segredo da federação no
// header x-admin-secret (o mesmo da festcash-push-facial). Nunca o navegador.
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function secretMatches(received: string | null, expected: string): boolean {
  if (!received || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const log = (step: string, d?: unknown) =>
  console.log(`[CARTEIRA-CODIGO-WHATSAPP] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method_not_allowed' }, 405);

  const linkSecret = Deno.env.get('FESTPAG_FESTPAY_LINK_SECRET');
  if (!linkSecret) return json({ ok: false, erro: 'ponte_nao_configurada' }, 500);
  if (!secretMatches(req.headers.get('x-admin-secret'), linkSecret)) {
    return json({ ok: false, erro: 'nao_autorizado' }, 401);
  }

  let body: { telefone?: string; codigo?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, erro: 'json_invalido' }, 400);
  }

  const numero = normalizarNumeroBr(body.telefone);
  const codigo = String(body.codigo ?? '');
  if (!numero || !/^\d{6}$/.test(codigo)) return json({ ok: false, erro: 'dados_invalidos' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  if (!(await carregarConfigWhatsApp(admin))) {
    log('whatsapp não configurado');
    return json({ ok: false, erro: 'whatsapp_nao_configurado' }, 200);
  }

  const texto = `Seu código FaceCashless: *${codigo}*. Vale por 10 minutos, não passe para ninguém.`;
  const r = await enviarCodigoWhatsApp(numero, codigo, texto, { timeoutMs: 8_000 });
  if (!r.ok) {
    log('falhou', { para: mascararNumero(numero), erro: r.erro });
    return json({ ok: false, erro: r.erro }, 200);
  }
  log('enviado', { para: mascararNumero(numero) });
  return json({ ok: true });
});
