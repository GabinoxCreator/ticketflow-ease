import { supabase } from '@/integrations/supabase/client';

/*
 * Convidado do pedido (OS-372): o comprador diz para quem é cada ingresso a mais e a FestPag
 * manda o link ao convidado por e-mail. O WhatsApp é o do comprador: a tela abre a conversa
 * com o link pronto (decisão do Gabriel, 03/11/2026). Quem confere tudo é a edge
 * `ingresso-convidado`; aqui ficam só as peças que as telas repetem.
 */

export type EstadoDoIngresso = 'livre' | 'convite' | 'transferindo' | 'transferido' | 'usado' | 'indisponivel';

export interface ConviteAberto {
  transferId: string;
  nome: string | null;
  cpfFinal: string;
  email: string | null;
  telefone: string | null;
  expiraEm: string;
  avisoEnviadoEm: string | null;
  link: string;
}

export interface IngressoDoPedido {
  id: string;
  rotulo: string;
  estado: EstadoDoIngresso;
  convidado?: Partial<ConviteAberto> & { cpfFinal: string };
}

export interface PedidoComConvidados {
  orderId: string;
  elegivel: boolean;
  evento?: string | null;
  ingressos: IngressoDoPedido[];
}

/**
 * Tira o motivo de dentro da resposta da edge: `functions.invoke` lança sempre a mesma frase
 * ("Edge Function returned a non-2xx status code") e o motivo de verdade vem no corpo.
 */
export async function motivoDaEdge(e: unknown): Promise<string> {
  const err = e as { context?: { json?: () => Promise<{ error?: string }> }; message?: string };
  try {
    const corpo = await err.context?.json?.();
    if (corpo?.error) return corpo.error;
  } catch { /* corpo não era JSON */ }
  const m = err?.message ?? '';
  return !m || m.includes('non-2xx') ? 'Não foi possível concluir agora. Tente de novo em instantes.' : m;
}

/** Chama a edge e devolve o corpo, ou lança com a frase que a pessoa entende. */
export async function chamarConvidado<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ingresso-convidado', { body });
  if (data?.error) throw new Error(data.error);
  if (error) throw new Error(await motivoDaEdge(error));
  return data as T;
}

/** "22/11", no fuso de Brasília. */
export const diaDoPrazo = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Abre o WhatsApp do comprador, na conversa com o convidado, com o link pronto. */
export function abrirWhatsappDoConvite(o: { nome?: string | null; telefone?: string | null; evento?: string | null; link: string; expiraEm?: string | null }) {
  const nome = (o.nome ?? '').trim().split(/\s+/)[0];
  const evento = o.evento ? ` no ${o.evento}` : '';
  const prazo = o.expiraEm ? ` O link vale até ${diaDoPrazo(o.expiraEm)}.` : '';
  const texto =
    `Oi${nome ? `, ${nome}` : ''}! Comprei um ingresso para você${evento}. ` +
    `Para ficar com ele, abra o link, crie a sua conta na FestPag e confirme o seu CPF:\n\n${o.link}\n\n` +
    `Se quiser, cadastre a sua facial para entrar mais rápido (é opcional; dá para entrar pelo QR).${prazo}`;
  const numero = String(o.telefone ?? '').replace(/\D/g, '');
  const url = numero
    ? `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener');
}
