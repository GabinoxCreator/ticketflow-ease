import { supabase } from '@/integrations/supabase/client';

// Federação FestPag Ingressos -> FestPay (carteira cashless). Helper compartilhado
// pelo menu "Minha Carteira" (Header) e pelo convite de carteira no fim do cadastro,
// pra não duplicar a lógica de emitir token + redirecionar.

// Base da carteira FestPay (federação). Trocar quando tiver domínio custom.
export const FESTPAY_BASE = 'https://festpay.lovable.app';

// Return url (Tijolo 7a): pra onde o FestPay volta sozinho depois da facial. URL
// absoluta https — o FestPay valida que é do domínio festpag.com.br antes de aceitar.
export const FESTPAY_RETURN_URL = 'https://festpag.digital/';

// Emite o link_token (edge autenticada: o supabase-js anexa o Bearer da sessão) e
// redireciona na MESMA aba pra /vincular do FestPay, já com a return url. Lança em
// caso de erro (sem sessão / edge falhou / sem link_token) — o caller mostra o toast
// e reseta o loading. No sucesso a página sai (window.location.href).
//
// Duas intenções distintas, separadas na ORIGEM via `opts.activate`:
//  - ATIVAR a carteira (convite do cadastro): activate=true -> manda &return= e &kyc=1,
//    pra o FestPay abrir a facial direto (Tijolo 8a) e voltar pro Ingressos no sucesso.
//  - SÓ ENTRAR e ficar (menu "Minha Carteira"): activate=false (default) -> manda só o
//    token. Sem return/kyc=1, pra um usuário já verificado NÃO ser jogado de volta.
// O token vai SEMPRE (é o handoff de sessão da federação). Default é "só entrar" (+seguro).
export async function openFestpayWallet(opts?: { activate?: boolean }): Promise<void> {
  const activate = opts?.activate ?? false;
  const { data, error } = await supabase.functions.invoke('federacao-emitir-token', {
    body: {},
  });
  if (error) throw error;
  const linkToken = data?.link_token;
  if (!linkToken) throw new Error('retorno sem link_token');
  // encodeURIComponent obrigatório: a return url vai dentro de um query param
  const url = activate
    ? `${FESTPAY_BASE}/vincular?token=${linkToken}&return=${encodeURIComponent(
        FESTPAY_RETURN_URL,
      )}&kyc=1`
    : `${FESTPAY_BASE}/vincular?token=${linkToken}`;
  window.location.href = url;
}
