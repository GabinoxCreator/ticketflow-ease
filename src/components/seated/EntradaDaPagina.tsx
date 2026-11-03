// Entrada da página única de uma lista de alunos (ajuste da Doca 347, Balé).
//
// O link da página ("/evento/alice-atraves-da-danca/mapa") não é de nenhuma
// sessão: a família informa o CPF do aluno e a tela mostra só as sessões em que
// ele dança; o toque leva ao mapa daquela sessão. Não reserva nada aqui: quem
// segura poltrona é o mapa da sessão.
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntradaDoAluno, type EventoDaEntrada } from '@/components/seated/EntradaDoAluno';
import {
  esquecerAluno, lerAluno, useListaDoEvento,
  type AlunoConferido, type PaginaDaLista,
} from '@/hooks/useListaDeAlunos';

interface Props {
  /** A 1ª sessão publicada (dá a capa e o local). */
  eventId: string;
  evento: EventoDaEntrada;
  pagina: PaginaDaLista;
}

export function EntradaDaPagina({ eventId, evento, pagina }: Props) {
  const { data: lista, isLoading, refetch, isFetching } = useListaDoEvento(eventId);
  const [aluno, setAluno] = useState<AlunoConferido | null>(null);

  useEffect(() => {
    if (lista?.lista_id) setAluno(lerAluno(lista.lista_id));
  }, [lista?.lista_id]);

  const trocarAluno = useCallback((novo: AlunoConferido | null) => {
    if (!novo) esquecerAluno(lista?.lista_id);
    setAluno(novo);
  }, [lista?.lista_id]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0b0a1a]">
        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
      </div>
    );
  }
  // Falha passageira (5xx às 8h da abertura) não é "sem lista": a família fica
  // aqui e tenta de novo, em vez de voltar para a página sem saber por quê.
  // Só sem lista NENHUMA: se uma releitura de fundo falhar (voltar à aba depois
  // de copiar o CPF), segue com a lista guardada e o CPF digitado fica.
  if (!lista) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#0b0a1a] px-6 text-center text-white">
        <p className="text-base">Não deu para carregar agora. Tente de novo em instantes.</p>
        <Button variant="hero" size="lg" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Tentar de novo
        </Button>
      </div>
    );
  }
  if (!lista.tem_lista) return <Navigate to={`/evento/${pagina.slug}`} replace />;

  return (
    <>
      <Helmet>
        <title>{evento.title} - Convites - FestPag</title>
      </Helmet>
      <EntradaDoAluno
        eventId={eventId}
        evento={evento}
        lista={lista}
        aluno={aluno}
        onAluno={trocarAluno}
        onSessaoAtual={() => undefined}
        naPagina
      />
    </>
  );
}
