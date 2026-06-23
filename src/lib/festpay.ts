import { supabase } from '@/integrations/supabase/client';

// Federação FestPag Ingressos -> FestPay (carteira cashless). Helper compartilhado
// pelo menu "Minha Carteira" (Header) e pelo convite de carteira no fim do cadastro,
// pra não duplicar a lógica de emitir token + redirecionar.

// Base da carteira FestPay (federação). Trocar quando tiver domínio custom.
export const FESTPAY_BASE = 'https://festpay.lovable.app';

// Return url (Tijolo 7a): pra onde o FestPay volta sozinho depois da facial. URL
// absoluta https — o FestPay valida que é do domínio festpag.com.br antes de aceitar.
export const FESTPAY_RETURN_URL = 'https://festpag.com.br/';

// Emite o link_token (edge autenticada: o supabase-js anexa o Bearer da sessão) e
// redireciona na MESMA aba pra /vincular do FestPay, já com a return url. Lança em
// caso de erro (sem sessão / edge falhou / sem link_token) — o caller mostra o toast
// e reseta o loading. No sucesso a página sai (window.location.href).
//
// Os dois pontos que chamam isto (menu "Minha Carteira" e convite do cadastro) têm a
// intenção de ATIVAR a carteira, então marcamos &kyc=1: o FestPay abre a facial direto
// (Tijolo 8a) em vez de cair na carteira e esperar o modal de 3s. O &return= é igual.
export async function openFestpayWallet(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('federacao-emitir-token', {
    body: {},
  });
  if (error) throw error;
  const linkToken = data?.link_token;
  if (!linkToken) throw new Error('retorno sem link_token');
  // encodeURIComponent obrigatório: a return url vai dentro de um query param
  window.location.href = `${FESTPAY_BASE}/vincular?token=${linkToken}&return=${encodeURIComponent(
    FESTPAY_RETURN_URL,
  )}&kyc=1`;
}
