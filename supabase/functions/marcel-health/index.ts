// marcel-health — prova que a integração com a API de pagamentos responde,
// SEM criar cobrança nenhuma.
//
// Existe porque migrar gateway às cegas é o caminho para descobrir problema com
// cliente na tela. Esta função bate na rota mais inofensiva que existe
// (`GET /parcelas`, que só devolve opções de parcelamento) e diz exatamente o
// que está errado quando está: chave ausente, chave inválida, sistema inativo.
//
// verify_jwt=true: é diagnóstico de operação, não rota pública.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { parcelasAceitas, MarcelIndisponivel } from "../_shared/marcel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Valor de teste: R$52,50 é o exemplo da própria documentação e cai na
    // faixa de 10x, então a resposta mostra a escada inteira de parcelas.
    const amount = 52.50;
    const resp = await parcelasAceitas(amount);

    if ((resp as { error?: string })?.error) {
      const err = (resp as { error?: string }).error;
      const explicacao: Record<string, string> = {
        api_key_ausente: 'O secret MARCEL_API_KEY não está configurado no projeto.',
        api_key_invalida: 'A chave configurada não é reconhecida pela API.',
        sistema_inativo: 'O acesso deste sistema foi desativado pela FestPag.',
        auth_indisponivel: 'A API não conseguiu validar a chave agora. Nada foi cobrado — tente de novo.',
      };
      return json({
        ok: false,
        etapa: 'autenticacao',
        error: err,
        explicacao: explicacao[err ?? ''] ?? 'Erro não catalogado — ver a resposta crua.',
        resposta: resp,
      }, 200);
    }

    return json({
      ok: true,
      etapa: 'conectado',
      amount,
      maxParcelas: (resp as { maxParcelas?: number })?.maxParcelas,
      minimoPorParcela: (resp as { minimoPorParcela?: number })?.minimoPorParcela,
      opcoes: (resp as { opcoes?: unknown[] })?.opcoes,
    });
  } catch (e) {
    if (e instanceof MarcelIndisponivel) {
      return json({
        ok: false,
        etapa: 'configuracao',
        error: 'nao_configurada',
        explicacao: e.message,
      }, 200);
    }
    // Timeout/rede. NÃO é recusa de pagamento — aqui nem chegou a existir uma.
    return json({
      ok: false,
      etapa: 'rede',
      error: 'indisponivel',
      explicacao: e instanceof Error ? e.message : String(e),
    }, 200);
  }
});
