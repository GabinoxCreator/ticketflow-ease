// Lista de alunos do evento (OS-346, Balé da Bruna; modelo novo na OS-365).
//
// Evento com lista só vende poltrona para quem informa o CPF de um aluno da
// lista, e só na sessão em que o aluno dança. Quem confere é o banco
// (`aluno_conferir`), que devolve só o primeiro nome, as sessões do aluno,
// quantos convites restam e um PASSE: é o passe que o navegador guarda, nunca o
// CPF. A trava de verdade mora no servidor (`hold_seats_aluno` e
// `create_seat_order`); esta tela só conduz a família.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export interface SessaoDaLista {
  event_id: string;
  slug: string | null;
  title: string;
  date: string;
  time: string | null;
  /** Número da sessão na lista (1 = 1ª sessão). */
  sessao: number;
}

export interface InfoDaLista {
  tem_lista: boolean;
  lista_id?: string;
  limite_por_aluno?: number;
  /** A venda abre para toda a lista neste instante. */
  abre_em?: string;
  /** Número da sessão DESTE evento na lista. */
  sessao?: number;
  /** A página única das sessões (link e título), quando a lista tem uma. */
  pagina_slug?: string | null;
  pagina_titulo?: string | null;
  sessoes?: SessaoDaLista[];
}

/** A página única de uma lista: um link só para as sessões (ajuste da Doca 347). */
export interface PaginaDaLista {
  lista_id: string;
  slug: string;
  titulo: string | null;
  /** A 1ª sessão publicada: é ela que dá capa, local e descrição à página. */
  event_id: string;
}

export interface AlunoConferido {
  passe: string;
  vale_ate: string;
  lista_id: string;
  primeiro_nome: string;
  /** Sessões em que o aluno dança (só nelas ele compra). */
  sessoes: number[];
  limite: number;
  usados: number;
  restantes: number;
  abre_em: string;
  liberado: boolean;
}

export type RecusaDaConferencia = 'nao_encontrado' | 'muitas_tentativas' | 'sem_lista' | 'falha';

// As funções ainda não estão nos tipos gerados (types.ts é do Lovable).
type RpcSemTipo = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

/** Se o evento tem lista de alunos, e os horários e sessões dela. Sem dado de pessoa. */
export function useListaDoEvento(eventId: string | undefined) {
  return useQuery({
    queryKey: ['lista-alunos', eventId],
    enabled: !!eventId,
    staleTime: 60_000,
    // Evento sem lista é a maioria: uma tentativa a mais e segue para o mapa.
    retry: 1,
    queryFn: async (): Promise<InfoDaLista> => {
      const rpc = supabasePublic.rpc as unknown as RpcSemTipo;
      const { data, error } = await rpc.call(supabasePublic, 'evento_lista_info', { _event_id: eventId });
      if (error) throw new Error(error.message || 'evento_lista_info');
      return (data as InfoDaLista) ?? { tem_lista: false };
    },
  });
}

/** Do link da página para a lista e a 1ª sessão. Link que não é de página: null. */
export async function buscarPaginaDaLista(slug: string): Promise<PaginaDaLista | null> {
  const rpc = supabasePublic.rpc as unknown as RpcSemTipo;
  const { data, error } = await rpc.call(supabasePublic, 'lista_pela_pagina', { _slug: slug });
  // Antes da migration a função não existe (PGRST202): o link só não é página.
  // Qualquer outro erro (tempo esgotado, 5xx às 8h da abertura) sobe, para o
  // react-query tentar de novo em vez de guardar "não é página".
  if (error) {
    if (error.code === 'PGRST202') return null;
    throw new Error(error.message || 'lista_pela_pagina');
  }
  if (!data) return null;
  const r = data as Record<string, unknown>;
  if (r.tem_pagina !== true || !r.event_id || !r.slug) return null;
  return r as unknown as PaginaDaLista;
}

const chave = (listaId: string) => `festpag:aluno:${listaId}`;

/** O passe guardado nesta aba (some ao fechar a aba ou quando vence). */
export function lerAluno(listaId: string | undefined): AlunoConferido | null {
  if (!listaId) return null;
  try {
    const bruto = sessionStorage.getItem(chave(listaId));
    if (!bruto) return null;
    const a = JSON.parse(bruto) as AlunoConferido;
    if (!a?.passe || !a.vale_ate || new Date(a.vale_ate).getTime() <= Date.now()) {
      sessionStorage.removeItem(chave(listaId));
      return null;
    }
    return a;
  } catch {
    return null;
  }
}

export function guardarAluno(a: AlunoConferido) {
  try { sessionStorage.setItem(chave(a.lista_id), JSON.stringify(a)); } catch { /* aba sem storage: segue só na memória */ }
}

export function esquecerAluno(listaId: string | undefined) {
  if (!listaId) return;
  try { sessionStorage.removeItem(chave(listaId)); } catch { /* nada */ }
}

/** As sessões da lista em que este aluno dança (as outras ele não compra). */
export function sessoesDoAluno(lista: InfoDaLista | undefined, aluno: AlunoConferido | null): SessaoDaLista[] {
  if (!aluno) return [];
  const dele = new Set(aluno.sessoes ?? []);
  return (lista?.sessoes ?? []).filter((s) => dele.has(s.sessao));
}

/** Confere o aluno no banco pelo CPF. Precisa de conta logada. */
export async function conferirAluno(
  eventId: string,
  cpfDigitos: string,
): Promise<{ ok: true; aluno: AlunoConferido } | { ok: false; motivo: RecusaDaConferencia; tenteDeNovoEm?: string }> {
  const rpc = supabase.rpc as unknown as RpcSemTipo;
  const { data, error } = await rpc.call(supabase, 'aluno_conferir', {
    _event_id: eventId,
    _cpf: cpfDigitos,
  });
  if (error || !data) return { ok: false, motivo: 'falha' };
  const r = data as Record<string, unknown>;
  if (r.ok === true) return { ok: true, aluno: r as unknown as AlunoConferido };
  const motivo = (r.motivo as RecusaDaConferencia) ?? 'falha';
  return { ok: false, motivo, tenteDeNovoEm: (r.tente_de_novo_em as string) ?? undefined };
}

/** "Alice através da Dança · 1ª sessão" -> "Alice através da Dança". */
export function tituloSemSessao(t: string): string {
  const i = t.lastIndexOf(' · ');
  return i > 0 && /sessão$/i.test(t) ? t.slice(0, i) : t;
}

/** "09/11 às 8h" no relógio de Brasília. */
export function quandoAbre(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const [h, m] = hora.split(':');
  return `${dia} às ${Number(h)}h${m && m !== '00' ? m : ''}`;
}
