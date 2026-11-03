// Lista de alunos do evento (OS-346, Balé da Bruna).
//
// Evento com lista só vende poltrona para quem informa o CPF e a data de
// nascimento de uma criança da lista. Quem confere é o banco
// (`aluno_conferir`), que devolve só o primeiro nome da criança, quantos
// convites restam e um PASSE: é o passe que o navegador guarda, nunca o CPF nem
// o nascimento da criança. A trava de verdade mora no servidor
// (`hold_seats_aluno` e `create_seat_order`); esta tela só conduz a família.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export interface SessaoDaLista {
  event_id: string;
  slug: string | null;
  title: string;
  date: string;
  time: string | null;
}

export interface InfoDaLista {
  tem_lista: boolean;
  lista_id?: string;
  limite_por_aluno?: number;
  abre_lote1_em?: string;
  abre_lote2_em?: string;
  sessoes?: SessaoDaLista[];
}

export interface AlunoConferido {
  passe: string;
  vale_ate: string;
  lista_id: string;
  primeiro_nome: string;
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
) => Promise<{ data: unknown; error: { message?: string } | null }>;

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

/** Confere a criança no banco. Precisa de conta logada. */
export async function conferirAluno(
  eventId: string,
  cpfDigitos: string,
  nascimentoIso: string,
): Promise<{ ok: true; aluno: AlunoConferido } | { ok: false; motivo: RecusaDaConferencia; tenteDeNovoEm?: string }> {
  const rpc = supabase.rpc as unknown as RpcSemTipo;
  const { data, error } = await rpc.call(supabase, 'aluno_conferir', {
    _event_id: eventId,
    _cpf: cpfDigitos,
    _nascimento: nascimentoIso,
  });
  if (error || !data) return { ok: false, motivo: 'falha' };
  const r = data as Record<string, unknown>;
  if (r.ok === true) return { ok: true, aluno: r as unknown as AlunoConferido };
  const motivo = (r.motivo as RecusaDaConferencia) ?? 'falha';
  return { ok: false, motivo, tenteDeNovoEm: (r.tente_de_novo_em as string) ?? undefined };
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
