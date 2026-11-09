import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, Calendar, MapPin, AlertCircle, Ticket, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabasePublic } from '@/integrations/supabase/publicClient';
import { useAuth } from '@/contexts/AuthContext';
import { useFacialPendente } from '@/hooks/useFacialPendente';
import { AuthModalV2 } from '@/components/auth/AuthModalV2';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import { formatEventDate, formatInSaoPaulo } from '@/lib/eventTime';
import { readPendingCheckout } from '@/lib/pendingCheckout';
import type { ItemDoCarrinho } from '@/lib/loja/carrinho';

/*
 * Página do LINK DE VENDA (OS-405, 08/11/2026): o checkout que já abre com o carrinho
 * montado pela casa. Nasceu do pedido da Thais (Fogo & Fumaça): uma inteira e uma meia
 * para uma mãe que leva a filha especial, sem abrir um lote de meia para todo mundo.
 *
 * Decisões do Gabriel (08/11): o lote de meia fica escondido do evento e só sai por este
 * link; o link vale para UMA compra e vence em 24 horas, com o preço do momento em que foi
 * gerado enquanto o lote estiver aberto ("Não, recusa quando o lote vira"); só o admin da
 * casa gera (tela "Venda por link" no admin do evento).
 *
 * Esta página só MOSTRA. Quem decide lote, quantidade e preço é o servidor, pelo link
 * gravado no banco (`marcel-create-pix` e `marcel-process-card` recebem só o token).
 */

type Situacao = 'valendo' | 'em_pagamento' | 'usado' | 'vencido' | 'cancelado' | 'lote_encerrado' | 'nao_encontrado';

interface ItemDoLink {
  lot_id: string;
  nome: string | null;
  setor: string | null;
  modo_taxa: string | null;
  quantidade: number;
  preco: number;
}

interface LinkVisto {
  ok: boolean;
  situacao: Situacao;
  expira_em?: string;
  evento?: {
    id: string;
    slug: string | null;
    title: string;
    date: string;
    time: string | null;
    venue: string | null;
    city: string | null;
    state: string | null;
    image_url: string | null;
  };
  itens?: ItemDoLink[];
}

const AVISO: Record<Exclude<Situacao, 'valendo'>, string> = {
  em_pagamento: 'Já existe um pagamento em andamento por este link. Se foi você, conclua o PIX gerado; se ele vencer, o link volta a valer até o prazo dele.',
  usado: 'Este link já foi usado numa compra. Os ingressos estão em "Meus ingressos" na conta de quem comprou.',
  vencido: 'Este link venceu. Peça um link novo a quem enviou.',
  cancelado: 'Este link foi cancelado. Peça um link novo a quem enviou.',
  // Decisão do Gabriel (08/11): o link só vende enquanto o lote está aberto.
  lote_encerrado: 'O lote deste link encerrou. Peça um link novo a quem enviou.',
  nao_encontrado: 'Não encontramos este link. Confira se ele foi copiado inteiro.',
};

const formatPrice = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "Premium · Meia": o setor na frente, como o totem e a maquininha mostram. */
const nomeDoItem = (i: ItemDoLink) => {
  const nome = (i.nome ?? '').trim() || 'Ingresso';
  const setor = (i.setor ?? '').trim();
  return setor && !nome.toLowerCase().includes(setor.toLowerCase()) ? `${setor} · ${nome}` : nome;
};

export default function LinkDeVenda() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const facialPend = useFacialPendente();
  const [link, setLink] = useState<LinkVisto | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // A função ainda não está nos tipos gerados (types.ts é do Lovable).
      const rpc = supabasePublic.rpc as unknown as (
        fn: string, args: Record<string, unknown>,
      ) => Promise<{ data: LinkVisto | null; error: { message?: string } | null }>;
      const { data, error } = await rpc.call(supabasePublic, 'link_de_venda_ver', { _token: (token ?? '').trim().toLowerCase() });
      if (!vivo) return;
      if (error || !data) { setFalhou(true); return; }
      setLink(data);
    })();
    return () => { vivo = false; };
  }, [token]);

  const evento = link?.evento;
  const itens = link?.itens ?? [];
  const carrinho: ItemDoCarrinho[] = itens.map((i) => ({
    lotId: i.lot_id,
    lotName: nomeDoItem(i),
    quantity: i.quantidade,
    price: Number(i.preco),
    modoTaxa: i.modo_taxa ?? 'cliente_paga',
  }));
  const totalIngressos = itens.reduce((s, i) => s + Number(i.preco) * i.quantidade, 0);
  // Quem gerou um PIX por este link e voltou: o pedido dele está guardado neste aparelho.
  const pedidoGuardado = evento ? readPendingCheckout() : null;
  const meuPedido = pedidoGuardado && pedidoGuardado.eventId === evento?.id ? pedidoGuardado.orderId : null;

  const dataLonga = evento
    ? `${formatEventDate(evento.date, { day: '2-digit', month: 'long' })}${evento.time ? ` · ${evento.time.slice(0, 5)}` : ''}`
    : '';
  const lugar = evento
    ? [evento.venue, [evento.city, evento.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')
    : '';

  const comprar = () => {
    if (!user || facialPend.pendente) setContaAberta(true);
    else setPagamentoAberto(true);
  };

  const carregando = !link && !falhou;
  const situacao: Situacao | null = falhou ? null : link?.situacao ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{evento ? `Sua compra · ${evento.title}` : 'Sua compra'} | FestPag</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* A capa do evento costuma trazer texto (data, local) dentro da arte: o título vai
          embaixo dela, nunca por cima, para não embaralhar com o texto do flyer. */}
      <div className="max-w-xl mx-auto sm:px-5 sm:pt-5">
        <div className="relative aspect-[16/9] w-full overflow-hidden sm:rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-background">
          {evento?.image_url && (
            <img src={evento.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-5 pb-16 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Compra pelo link</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight mt-1 mb-2">
          {evento?.title ?? (carregando ? 'Carregando…' : 'Link de compra')}
        </h1>
        {evento && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-6">
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{dataLonga}</span>
            {lugar && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{lugar}</span>}
          </div>
        )}

        {carregando && (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        )}

        {(falhou || (situacao && situacao !== 'valendo')) && (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center space-y-4">
            <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">
              {falhou ? 'Não conseguimos abrir o link agora. Tente de novo em instantes.' : AVISO[situacao as Exclude<Situacao, 'valendo'>]}
            </p>
            {situacao === 'em_pagamento' && meuPedido && (
              <Button size="lg" className="w-full" onClick={() => navigate(`/pedido/${meuPedido}`)}>
                Ver meu pedido
              </Button>
            )}
            {situacao === 'usado' && (
              <Button variant="outline" size="lg" className="w-full" onClick={() => navigate('/meus-ingressos')}>
                Meus ingressos
              </Button>
            )}
          </div>
        )}

        {situacao === 'valendo' && evento && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
              <p className="text-sm font-semibold inline-flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" /> Seu carrinho
              </p>
              <div className="space-y-2.5">
                {carrinho.map((i) => (
                  <div key={i.lotId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary">
                        {i.quantity}x
                      </span>
                      <span className="text-foreground/90 truncate">{i.lotName}</span>
                    </div>
                    <span className="font-medium tabular-nums">{formatPrice(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
                <span className="text-muted-foreground">Ingressos</span>
                <span className="font-semibold tabular-nums">{formatPrice(totalIngressos)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                A taxa de serviço aparece no pagamento, antes de você confirmar.
              </p>
              {link?.expira_em && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Este link vale para uma compra, até {formatInSaoPaulo(link.expira_em, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
                </p>
              )}
            </div>

            <Button size="lg" className="w-full h-12 text-base" onClick={comprar}>
              Comprar
            </Button>
          </div>
        )}
      </div>

      <AuthModalV2
        isOpen={contaAberta}
        onClose={() => setContaAberta(false)}
        onAuthenticated={() => { setContaAberta(false); setPagamentoAberto(true); }}
      />

      {evento && situacao === 'valendo' && (
        <CheckoutModal
          isOpen={pagamentoAberto}
          onClose={() => setPagamentoAberto(false)}
          eventId={evento.id}
          eventTitle={evento.title}
          eventDate={evento.date}
          eventTime={evento.time ?? ''}
          eventVenue={evento.venue ?? ''}
          items={carrinho}
          totalAmount={totalIngressos}
          linkToken={(token ?? '').trim().toLowerCase()}
        />
      )}
    </div>
  );
}
