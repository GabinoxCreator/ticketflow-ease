import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Wallet, Loader2, Search, TrendingUp, ArrowUpRight, Calendar, Banknote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { PinSetupCard } from '@/components/producer/PinSetupCard';
import { BankAccountCard } from '@/components/producer/BankAccountCard';
import { PinVerificationDialog } from '@/components/producer/PinVerificationDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useProducerFinance } from '@/hooks/useProducerFinance';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PAYOUT_ERROR_MESSAGES: Record<string, string> = {
  already_requested: 'Você já tem um saque solicitado para este evento.',
  no_available_balance: 'Não há saldo disponível para saque.',
  no_bank_account: 'Cadastre sua conta bancária antes de solicitar o saque.',
  not_event_owner: 'Este evento não pertence à sua conta.',
  event_not_found: 'Evento não encontrado.',
};

const formatBRL = (v: number) => {
  const [intPart, fracPart] = v.toFixed(2).split('.');
  const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$\u00A0${intWithDots},${fracPart}`;
};

const parseDate = (d: string) => new Date(`${d}T12:00:00`);

export default function Financeiro() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [search, setSearch] = useState('');

  const checkPinStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('producer_stripe_accounts')
        .select('pin_hash')
        .single();
      setHasPin(!!data?.pin_hash);
    } catch {
      setHasPin(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { checkPinStatus(); }, [checkPinStatus]);

  const showContent = !hasPin || isUnlocked;
  const { data: finance, isLoading: financeLoading } = useProducerFinance();

  const filteredEvents = useMemo(() => {
    if (!finance?.events) return [];
    const q = search.trim().toLowerCase();
    if (!q) return finance.events;
    return finance.events.filter((e) => e.title.toLowerCase().includes(q));
  }, [finance, search]);

  return (
    <ProducerLayout>
      <Helmet>
        <title>Financeiro | FestPag</title>
        <meta name="description" content="Gerencie seu financeiro, repasses e dados bancários" />
      </Helmet>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <PinVerificationDialog
            open={hasPin && !isUnlocked}
            onVerified={() => setIsUnlocked(true)}
            hasPin={hasPin}
            onPinCreated={() => { setHasPin(true); setIsUnlocked(true); }}
          />

          {showContent && (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-3">
                  <Wallet className="w-7 h-7 text-primary" />
                  Financeiro
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Acompanhe seus eventos, repasses e dados bancários
                </p>
              </div>

              {/* Global Balance */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                      <TrendingUp className="w-4 h-4" /> Receita Líquida
                    </div>
                    <div className="text-3xl font-bold mt-2 break-words">
                      {financeLoading ? '—' : formatBRL(finance?.totals.net || 0)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                      <ArrowUpRight className="w-4 h-4" /> Já Repassado
                    </div>
                    <div className="text-3xl font-bold mt-2 break-words">
                      {financeLoading ? '—' : formatBRL(finance?.totals.paidOut || 0)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                      <Wallet className="w-4 h-4" /> Disponível
                    </div>
                    <div className="text-3xl font-bold mt-2 break-words text-secondary">
                      {financeLoading ? '—' : formatBRL(finance?.totals.available || 0)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Composição da Receita Líquida (Online vs Manual) */}
              {!financeLoading && finance && finance.totals.grossManual > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Receita Online</div>
                      <div className="text-xl font-bold mt-1 break-words">
                        {formatBRL(finance.totals.netOnline)}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Bruto {formatBRL(finance.totals.grossOnline)} · transações via Mercado Pago
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Receita Manual</div>
                      <div className="text-xl font-bold mt-1 break-words">
                        {formatBRL(finance.totals.netManual)}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Bruto {formatBRL(finance.totals.grossManual)} · vendas registradas pelo produtor
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tabs */}
              <Tabs defaultValue="por-evento" className="w-full">
                <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                  <TabsTrigger value="por-evento">Por Evento</TabsTrigger>
                  <TabsTrigger value="dados">Dados & PIN</TabsTrigger>
                </TabsList>

                <TabsContent value="por-evento" className="mt-4 space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar eventos"
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  {financeLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredEvents.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground">
                        Nenhum evento encontrado.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filteredEvents.map((event) => (
                        <Link key={event.id} to={`/produtor/financeiro/${event.id}`}>
                          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-4 min-w-0">
                                {event.image_url ? (
                                  <img
                                    src={event.image_url}
                                    alt={event.title}
                                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                    <Calendar className="w-6 h-6 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold truncate">{event.title}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {format(parseDate(event.date), "EEE, dd 'de' MMM. 'de' yyyy", { locale: ptBR })}
                                  </div>
                                </div>
                                <div className="hidden sm:flex flex-col items-end flex-shrink-0">
                                  <div className="font-semibold">{formatBRL(event.net)}</div>
                                  <div className="text-xs text-muted-foreground">Receita Líquida</div>
                                </div>
                                <div className="flex flex-col items-end flex-shrink-0">
                                  <div className="font-semibold text-secondary">{formatBRL(event.available)}</div>
                                  <div className="text-xs text-muted-foreground">Disponível</div>
                                </div>
                              </div>
                              {/* mobile-only net */}
                              <div className="flex sm:hidden justify-between mt-3 pt-3 border-t border-border text-xs">
                                <span className="text-muted-foreground">Receita Líquida</span>
                                <span className="font-medium">{formatBRL(event.net)}</span>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="dados" className="mt-4 space-y-6">
                  <BankAccountCard />
                  <PinSetupCard />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </>
      )}
    </ProducerLayout>
  );
}
