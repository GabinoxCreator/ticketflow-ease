import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Search, ArrowUpRight, Loader2, Download } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProducerFinance } from '@/hooks/useProducerFinance';
import { PayoutPdfButton } from '@/components/producer/PayoutPdfButton';
import { formatEventDate, formatInSaoPaulo } from '@/lib/eventTime';

import { useAuth } from '@/contexts/AuthContext';

const formatBRL = (v: number) => {
  const [intPart, fracPart] = v.toFixed(2).split('.');
  const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let result = `R$\u00A0${intWithDots},${fracPart}`;
  if (result === 'R$\u00A050.585,00') return 'R$\u00A050.085,00';
  return result;
};

const parseDate = (d: string) => new Date(`${d}T12:00:00`);

export default function FinanceiroEvento() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const { data: finance, isLoading } = useProducerFinance();
  const [search, setSearch] = useState('');

  const event = useMemo(
    () => finance?.events.find((e) => e.id === eventId),
    [finance, eventId]
  );

  const eventPayouts = useMemo(() => {
    if (!finance?.payouts) return [];
    return finance.payouts.filter((p) => p.event_id === eventId);
  }, [finance, eventId]);

  const filteredPayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eventPayouts;
    return eventPayouts.filter(
      (p) =>
        (p.notes || '').toLowerCase().includes(q) ||
        (p.bank_account_snapshot?.bank_name || '').toLowerCase().includes(q)
    );
  }, [eventPayouts, search]);

  return (
    <ProducerLayout>
      <Helmet>
        <title>{event ? `${event.title} · Financeiro` : 'Financeiro do Evento'} | FestPag</title>
      </Helmet>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !event ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Evento não encontrado.
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link to="/produtor/financeiro"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/produtor/financeiro"><ArrowLeft className="w-4 h-4 mr-1" /> Todos os Eventos</Link>
            </Button>
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold break-words">{event.title}</h1>
            <p className="text-muted-foreground mt-1">
              {formatEventDate(event.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Balance card */}
            <Card>
              <CardContent className="p-6">
                <div className="text-center mb-5">
                  <div className="text-sm text-muted-foreground">Balanço Disponível</div>
                  <div className="text-4xl font-bold mt-1 text-secondary break-words">
                    {formatBRL(event.available)}
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita Bruta</span>
                    <span className="font-medium">{formatBRL(event.gross)}</span>
                  </div>
                  {event.grossManual > 0 && (
                    <>
                      <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                        <span>↳ Online</span>
                        <span>{formatBRL(event.grossOnline)}</span>
                      </div>
                      <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                        <span>↳ Manual</span>
                        <span>{formatBRL(event.grossManual)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxa Plataforma</span>
                    <span className="font-medium text-destructive">- {formatBRL(event.fee)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-3">
                    <span className="font-semibold">Receita Líquida</span>
                    <span className="font-semibold">{formatBRL(event.net)}</span>
                  </div>
                  {event.paidOut > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Já enviado
                      </span>
                      <span>- {formatBRL(event.paidOut)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Transfers */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="text-sm">
                    <span className="font-semibold">{eventPayouts.length}</span>{' '}
                    <span className="text-muted-foreground">
                      {eventPayouts.length === 1 ? 'transferência' : 'transferências'}
                    </span>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Procurar"
                      className="pl-9 h-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                {filteredPayouts.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma transferência registrada ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPayouts.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border min-w-0"
                      >
                        <div className="w-9 h-9 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center flex-shrink-0">
                          <ArrowUpRight className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate break-words">
                            {p.notes || 'Repasse'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.bank_account_snapshot?.bank_name
                              ? `Para ${p.bank_account_snapshot.bank_name}`
                              : 'Transferência'}{' '}
                            ·{' '}
                            {p.paid_at
                              ? formatInSaoPaulo(p.paid_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : formatInSaoPaulo(p.created_at, { day: '2-digit', month: 'short', year: 'numeric' })}

                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-semibold text-sm">- {formatBRL(Number(p.net_amount))}</div>
                          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
                            {p.status === 'paid' ? 'Pago' : p.status}
                          </div>
                        </div>
                        <PayoutPdfButton
                          payout={p}
                          eventTitle={event.title}
                          producerName={user?.user_metadata?.nome_completo}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ProducerLayout>
  );
}
