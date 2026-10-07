// O PIN protege a conta do repasse e o CPF/CNPJ da produtora (OS-166, 07/10/2026).
//
// A conferência mora no banco: `conferir_meu_pin`, `definir_meu_pin`,
// `salvar_minha_conta_de_repasse` e `salvar_documento_da_produtora` conferem o
// PIN por dentro, com limite de tentativas, e a tabela recusa gravação direta.
// O navegador nem enxerga o PIN guardado: só pergunta "tenho PIN?" (`meu_pin`).
//
// Os textos daqui são o que o produtor lê, aprovados pelo Gabriel na caixinha
// de 07/10. Mudar um texto daqui passa por ele.

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ── Textos aprovados (07/10) ────────────────────────────────────────────────
export const PIN_PARA_TROCAR_CONTA = 'Para trocar a conta que recebe os repasses, digite o seu PIN.';
export const PIN_PARA_TROCAR_DOCUMENTO = 'Para trocar o CPF/CNPJ da produtora, digite o seu PIN.';
export const PIN_INCORRETO = 'PIN incorreto. Nada foi trocado.';
export const PIN_BLOQUEADO = 'Muitas tentativas erradas. Por segurança, espere 30 minutos e tente de novo.';
export const PIN_CRIE_ANTES = 'Crie o seu PIN antes de salvar.';

export const AVISO_PIN = {
  titulo: 'Crie o seu PIN de segurança',
  texto:
    'O PIN é uma senha de 4 números, separada da senha de entrar. Ele é pedido sempre que alguém tenta trocar a conta que recebe os seus repasses ou o CPF/CNPJ da produtora. Assim, mesmo que descubram a sua senha, o seu dinheiro continua indo para você. Crie o PIN e aproveite para conferir a sua conta bancária.',
  botao: 'Criar PIN agora',
  depois: 'Agora não',
  rodape: 'Este aviso volta toda vez que você entrar no painel, até o PIN ser criado.',
};

export const EMAIL_SUPORTE = 'suporte@festpag.digital';

// ── Estado do PIN ───────────────────────────────────────────────────────────
export type MeuPin = {
  tem_pin: boolean;
  /** PIN no formato antigo: precisa ser criado de novo. */
  refazer: boolean;
  /** E-mail guardado no PIN, mascarado (g•••@gmail.com). Nulo = não há. */
  email_recuperacao: string | null;
  dono_de_produtora: boolean;
  admin: boolean;
};

export const CHAVE_MEU_PIN = 'meu-pin';

// As funções são novas e ainda não estão no types.ts gerado: chamada sem tipo.
// `bind`: o rpc usa o próprio client por dentro; solto, ele perde a referência.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export type RespostaPin = {
  ok: boolean;
  error?: string;
  retry_after_seconds?: number;
  [k: string]: unknown;
};

/** Chama uma das funções do PIN. Falha de rede ou do banco vira `{ok:false, error:'falha'}`. */
export async function chamarPin(fn: string, args?: Record<string, unknown>): Promise<RespostaPin> {
  const { data, error } = await rpc(fn, args);
  if (error || !data || typeof data !== 'object') return { ok: false, error: 'falha' };
  return data as RespostaPin;
}

/** Tem PIN? Para onde vai o código? Se a consulta falhar, vem `undefined`. */
export function useMeuPin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [CHAVE_MEU_PIN, user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<MeuPin> => {
      const r = await chamarPin('meu_pin');
      if (!r.ok) throw new Error(r.error || 'falha');
      return {
        tem_pin: r.tem_pin === true,
        refazer: r.refazer === true,
        email_recuperacao: typeof r.email_recuperacao === 'string' ? r.email_recuperacao : null,
        dono_de_produtora: r.dono_de_produtora === true,
        admin: r.admin === true,
      };
    },
  });
}

export const atualizarMeuPin = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: [CHAVE_MEU_PIN] });

/** A frase que o produtor lê quando uma troca com PIN não passa. */
export function mensagemDoPin(codigo: string | undefined): string {
  switch (codigo) {
    case 'pin_incorreto': return PIN_INCORRETO;
    case 'bloqueado': return PIN_BLOQUEADO;
    case 'sem_pin': return PIN_CRIE_ANTES;
    case 'pin_refazer': return 'Por segurança, crie o seu PIN de novo na aba Dados & PIN.';
    case 'pin_invalido': return 'O PIN deve ter 4 dígitos';
    case 'pin_atual_obrigatorio': return 'Digite seu PIN atual';
    case 'campos_obrigatorios': return 'Preencha todos os campos obrigatórios';
    case 'documento_titular_invalido': return 'O CPF ou CNPJ do titular está com número errado.';
    case 'documento_invalido': return 'Número de CPF ou CNPJ inválido.';
    case 'sem_permissao': return 'Você não tem permissão para trocar o CPF/CNPJ desta produtora.';
    default: return 'Não foi possível salvar agora. Tente de novo.';
  }
}

// ── PIN esquecido (edge pin-recuperar) ──────────────────────────────────────
export type RespostaRecuperar = {
  ok: boolean;
  erro?: string;
  desafioId?: string;
  destinoMascarado?: string;
  tentativasRestantes?: number;
};

/**
 * Chama a edge do PIN esquecido. Resposta de negócio vem 200 com `ok:false`;
 * limite de tentativas vem 429 com `error:'rate_limited'` e cai em `muitos_pedidos`.
 */
export async function recuperarPin(body: Record<string, unknown>): Promise<RespostaRecuperar> {
  try {
    const { data, error } = await supabase.functions.invoke('pin-recuperar', { body });
    let payload: any = data;
    const ctx = (error as any)?.context;
    if (error && ctx && typeof ctx.json === 'function') {
      try { payload = await ctx.json(); } catch { payload = null; }
    }
    if (payload?.error === 'rate_limited' || payload?.error === 'rate_limit_unavailable') {
      return { ok: false, erro: 'muitos_pedidos' };
    }
    if (!payload || typeof payload !== 'object') return { ok: false, erro: 'indisponivel' };
    return payload as RespostaRecuperar;
  } catch {
    return { ok: false, erro: 'indisponivel' };
  }
}

export function mensagemDaRecuperacao(r: RespostaRecuperar): string {
  switch (r.erro) {
    case 'codigo_invalido':
      return r.tentativasRestantes != null
        ? `Código errado. Você ainda tem ${r.tentativasRestantes} ${r.tentativasRestantes === 1 ? 'tentativa' : 'tentativas'}.`
        : 'Código errado.';
    case 'expirado': return 'O código venceu. Peça outro.';
    case 'queimado':
    case 'nao_encontrado':
    case 'desafio_nao_confere': return 'Esse código não vale mais. Peça outro.';
    case 'muitos_pedidos': return 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
    case 'sem_email': return `Este PIN não tem e-mail guardado. Escreva para ${EMAIL_SUPORTE} e a FestPag libera um PIN novo.`;
    case 'sem_pin': return 'Você ainda não tem PIN. Crie um na aba Dados & PIN.';
    case 'pin_invalido': return 'O PIN deve ter 4 dígitos';
    default: return 'Não conseguimos mandar o e-mail agora. Tente de novo em alguns minutos.';
  }
}
