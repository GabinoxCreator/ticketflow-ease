import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Wallet, Loader2, Search, Calendar, Banknote, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { PinSetupCard } from '@/components/producer/PinSetupCard';
import { BankAccountCard } from '@/components/producer/BankAccountCard';
import { PinVerificationDialog } from '@/components/producer/PinVerificationDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  AVISO_REPASSE,
  CHAVE_PENDENCIAS_REPASSE,
  MENSAGEM_PENDENCIA_REPASSE,
  usePendenciasRepasse,
  type PendenciaRepasse,
} from '@/lib/repasseDocumento';
import { atualizarMeuPin, useMeuPin, AVISO_PIN } from '@/lib/pinRepasse';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { ReguaEmCartoes } from '@/components/producer/ReguaDoDinheiro';
import { situacaoDoRepasse } from '@/lib/painelDoProdutor';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PAYOUT_ERROR_MESSAGES: Record<string, string> = {
  already_requested: 'Você já tem um saque solicitado para este evento.',
  no_available_balance: 'Não há saldo disponível para saque.',
  // Trava de documento e conta (OS-157): textos aprovados pelo Gabriel.
  ...MENSAGEM_PENDENCIA_REPASSE,
  not_event_owner: 'Este evento não pertence à sua conta.',
  event_not_found: 'Evento não encontrado.',
};

const formatBRL = (v: number) => {
  // Negativo (OS-416: o produtor deve à FestPag) sai "-R$ 77,80", como na régua.
  const [intPart, fracPart] = Math.abs(v).toFixed(2).split('.');
  const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 && Math.abs(v) >= 0.005 ? '-' : ''}R$\u00A0${intWithDots},${fracPart}`;
};

const parseDate = (d: string) => new Date(`${d}T12:00:00`);

const TIPO_DE_CHAVE: Record<string, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória',
};

interface ContaDeRepasse {
  bank_name: string; agency: string; account_number: string; account_holder_name: string;
  pix_key: string; pix_key_type: string;
}

// Pendência que se resolve em Configurações (documento da produtora); as outras, na
// aba da conta.
const PENDENCIA_EM_CONFIGURACOES: PendenciaRepasse[] = ['missing_document', 'invalid_document'];

export default function Financeiro() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<{ id: string; title: string; available: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Para onde vai o saque (OS-408): a mesma conta que o pedido de repasse usa no
  // banco (`request_payout` lê a conta do usuário logado).
  const { data: conta, isLoading: contaCarregando, isFetching: contaRelendo } = useQuery({
    queryKey: ['conta-de-repasse', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ContaDeRepasse | null> => {
      const { data, error } = await supabase
        .from('producer_bank_accounts' as any)
        .select('bank_name, agency, account_number, account_holder_name, pix_key, pix_key_type')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ContaDeRepasse) ?? null;
    },
  });

  // OS-166: "tem PIN?" vem do banco (meu_pin); o navegador não lê o PIN guardado.
  // Se a consulta falhar, a tela abre sem a trava, como antes: quem protege a
  // conta e o documento é o servidor, que pede o PIN na troca.
  const { data: meuPin, isLoading } = useMeuPin();
  const hasPin = !!meuPin?.tem_pin;
  // O pop-up do painel (OS-166) manda para cá com ?aba=dados.
  // Controlada: se o produtor já está no Financeiro quando clica no pop-up, a
  // aba tem que trocar mesmo sem a tela ser montada de novo.
  const [searchParams] = useSearchParams();
  const pedeDados = searchParams.get('aba') === 'dados';
  const [aba, setAba] = useState(pedeDados ? 'dados' : 'por-evento');
  useEffect(() => { if (pedeDados) setAba('dados'); }, [pedeDados, searchParams]);

  // Quem entrou sem PIN já está com a tela aberta: criar o PIN aqui não pode
  // fazer a trava aparecer em cima do que ele está preenchendo.
  useEffect(() => { if (meuPin && !meuPin.tem_pin) setIsUnlocked(true); }, [meuPin]);

  const showContent = !hasPin || isUnlocked;
  const { data: finance, isLoading: financeLoading } = useProducerFinance();
  const { data: pendencias = [] } = usePendenciasRepasse();
  // OS-417: com a trava da casa, o botão fica travado e só a frase do contrato aparece.
  const saqueTravado = pendencias.includes('saque_travado');
  // A trava não é pendência que o produtor resolve: fica fora da lista "Falta para
  // pedir o saque" da janela (OS-443, junção da OS-417 com a OS-416).
  const faltaParaOSaque = pendencias.filter((p) => p !== 'saque_travado');

  // Saque pedido e ainda não pago, por evento (decisão do Gabriel em 09/11: "Botão
  // desconta"). "A receber da FestPag" continua com ele dentro (o dinheiro ainda não
  // chegou). O banco só aceita UM pedido aberto por evento (índice único
  // `uniq_payout_requested_per_event`; o request_payout responde `already_requested`):
  // com um pedido aberto, o que dá para pedir agora é zero.
  const pedidoPorEvento = useMemo(() => {
    const m = new Map<string, number>();
    (finance?.payouts ?? []).filter((p) => p.status === 'requested' && p.event_id)
      .forEach((p) => m.set(p.event_id!, (m.get(p.event_id!) ?? 0) + Number(p.net_amount || 0)));
    return m;
  }, [finance]);
  const podePedir = (ev: { id: string; available: number }) => (pedidoPorEvento.has(ev.id) ? 0 : Math.max(0, ev.available));
  const rotuloDoSaque = (ev: { id: string; available: number }) =>
    pedidoPorEvento.has(ev.id) ? 'Saque pedido' : 'Solicitar Saque';

  // Abriu a janela: a conta e as pendências são lidas de novo, porque o produtor pode
  // ter acabado de cadastrar ou trocar a conta na outra aba (revisão da OS-408).
  useEffect(() => {
    if (!selectedEvent) return;
    queryClient.invalidateQueries({ queryKey: ['conta-de-repasse'] });
    queryClient.invalidateQueries({ queryKey: [CHAVE_PENDENCIAS_REPASSE] });
  }, [selectedEvent, queryClient]);

  const filteredEvents = useMemo(() => {
    if (!finance?.events) return [];
    const q = search.trim().toLowerCase();
    if (!q) return finance.events;
    return finance.events.filter((e) => e.title.toLowerCase().includes(q));
  }, [finance, search]);

  const handleConfirmPayout = async () => {
    if (!selectedEvent) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-payout', {
        body: { event_id: selectedEvent.id },
      });

      let payload: any = data;
      if (error && (error as any).context && typeof (error as any).context.json === 'function') {
        try { payload = await (error as any).context.json(); } catch { /* noop */ }
      }

      if (error && !payload) {
        toast.error('Não foi possível solicitar o saque. Tente novamente.');
        return;
      }

      if (!payload?.ok) {
        const code = payload?.error as string | undefined;
        toast.error(PAYOUT_ERROR_MESSAGES[code ?? ''] ?? 'Não foi possível solicitar o saque. Tente novamente.');
        // O servidor pode ter visto uma pendência que o aviso ainda não mostrava.
        if (Array.isArray(payload?.pendencias)) {
          queryClient.invalidateQueries({ queryKey: [CHAVE_PENDENCIAS_REPASSE] });
        }
        return;
      }

      toast.success('Saque solicitado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['producer-finance'] });
    } catch {
      toast.error('Não foi possível solicitar o saque. Tente novamente.');
    } finally {
      setIsSubmitting(false);
      setSelectedEvent(null);
    }
  };


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
            onPinCreated={() => { setIsUnlocked(true); atualizarMeuPin(queryClient); }}
            emailRecuperacao={meuPin?.email_recuperacao ?? null}
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

              {/* Trava de documento e conta (OS-157): só aparece quando falta algo. */}
              {saqueTravado && (
                <Alert className="border-primary/30 bg-primary/5">
                  <Banknote className="h-4 w-4 !text-primary" />
                  <AlertDescription>{MENSAGEM_PENDENCIA_REPASSE.saque_travado}</AlertDescription>
                </Alert>
              )}
              {!saqueTravado && pendencias.length > 0 && (
                <Alert className="border-amber-500/50 bg-amber-500/5">
                  <AlertTriangle className="h-4 w-4 !text-amber-500" />
                  <AlertDescription className="space-y-2">
                    <p>{AVISO_REPASSE}</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {pendencias.map((p) => (
                        <li key={p} className="font-medium">{MENSAGEM_PENDENCIA_REPASSE[p]}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* A régua do dinheiro (OS-408): as cinco palavras, na mesma ordem de toda tela. */}
              <ReguaEmCartoes
                carregando={financeLoading}
                numeros={{
                  vendido: (finance?.totals.netOnline || 0) + (finance?.totals.netManual || 0),
                  taxaDoComprador: finance?.totals.fee || 0,
                  juro: finance?.totals.interest || 0,
                  recebidoDireto: finance?.totals.receivedDirectly || 0,
                  taxaDoDinheiro: finance?.totals.cashFee || 0,
                  taxaNoAReceber: finance?.totals.cashFeeNoAReceber || 0,
                  aReceber: finance ? finance.totals.available : null,
                  jaPago: finance ? finance.totals.paidOut : null,
                }}
              />

              {/* Saques pedidos (OS-408): antes só apareciam dentro de cada evento. */}
              {!financeLoading && (finance?.payouts.length ?? 0) > 0 && (
                <Card data-testid="saques-pedidos">
                  <CardContent className="p-4 space-y-2">
                    <h2 className="font-semibold text-sm">Saques pedidos</h2>
                    <ul className="divide-y divide-border">
                      {finance!.payouts.map((p) => {
                        const ev = finance!.events.find((e) => e.id === p.event_id);
                        const quando = p.paid_at || p.created_at;
                        return (
                          <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{ev?.title ?? 'Evento'}</div>
                              <div className="text-xs text-muted-foreground">
                                {quando ? format(new Date(quando), "dd/MM/yyyy", { locale: ptBR }) : ''}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-semibold tabular-nums">{formatBRL(Number(p.net_amount))}</div>
                              <div className="text-[11px] text-muted-foreground">{situacaoDoRepasse(p.status)}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Tabs */}
              <Tabs value={aba} onValueChange={setAba} className="w-full">
                <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                  <TabsTrigger value="por-evento">Por Evento</TabsTrigger>
                  <TabsTrigger value="dados">Conta bancária e PIN</TabsTrigger>
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
                                  <div className="font-semibold">{formatBRL(event.netOnline + event.netManual)}</div>
                                  <div className="text-xs text-muted-foreground">Vendido</div>
                                </div>
                                <div className="flex flex-col items-end flex-shrink-0">
                                  <div className="font-semibold">{formatBRL(event.available)}</div>
                                  <div className="text-xs text-muted-foreground">A receber da FestPag</div>
                                </div>
                                <Button
                                  size="sm"
                                  className="hidden sm:inline-flex flex-shrink-0 gap-1.5"
                                  disabled={podePedir(event) <= 0 || saqueTravado}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedEvent({ id: event.id, title: event.title, available: podePedir(event) });
                                  }}
                                >
                                  <Banknote className="w-4 h-4" />
                                  {rotuloDoSaque(event)}
                                </Button>
                              </div>
                              {/* mobile-only net + saque */}
                              <div className="flex sm:hidden justify-between mt-3 pt-3 border-t border-border text-xs">
                                <span className="text-muted-foreground">Vendido</span>
                                <span className="font-medium">{formatBRL(event.netOnline + event.netManual)}</span>
                              </div>
                              <Button
                                size="sm"
                                className="sm:hidden w-full mt-3 gap-1.5"
                                disabled={podePedir(event) <= 0 || saqueTravado}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedEvent({ id: event.id, title: event.title, available: podePedir(event) });
                                }}
                              >
                                <Banknote className="w-4 h-4" />
                                {rotuloDoSaque(event)}
                              </Button>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="dados" className="mt-4 space-y-6">
                  {/* Sem PIN, o PIN vem primeiro: a conta só se salva com ele (OS-166).
                      Lista com chave para a troca de ordem não apagar o que está sendo digitado. */}
                  {(hasPin ? ['conta', 'pin'] : ['pin', 'conta']).map((k) =>
                    k === 'conta' ? <BankAccountCard key="conta" /> : <PinSetupCard key="pin" />,
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </>
      )}

      {/* Janela do saque (OS-408): diz para onde vai o dinheiro e, se falta algo, o
          quê, em vez de deixar o servidor recusar. Sem PIN só avisa: o saque segue
          (decisão do Gabriel em 09/11: "Avisa e deixa pedir"). O prazo do repasse
          não entra aqui: só vai a texto de cliente depois de ajustar os dias (06/11). */}
      <AlertDialog open={selectedEvent != null} onOpenChange={(open) => { if (!open && !isSubmitting) setSelectedEvent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar saque</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground" data-testid="janela-do-saque">
                {selectedEvent && (
                  <p>
                    <span className="font-semibold text-foreground">{formatBRL(selectedEvent.available)}</span> de {selectedEvent.title}
                  </p>
                )}
                {contaCarregando ? (
                  <p className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Conferindo a conta que vai receber...</p>
                ) : conta && conta.bank_name ? (
                  <div className="rounded-lg border p-3 space-y-0.5" data-testid="destino-do-saque">
                    <p className="font-medium text-foreground">Vai para</p>
                    {conta.pix_key ? (
                      <p>PIX ({TIPO_DE_CHAVE[conta.pix_key_type] ?? 'chave'}): {conta.pix_key}</p>
                    ) : (
                      <p>{conta.bank_name} · agência {conta.agency} · conta {conta.account_number}</p>
                    )}
                    <p>Titular: {conta.account_holder_name}</p>
                  </div>
                ) : null}
                {saqueTravado ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="saque-travado-na-janela">
                    <p>{MENSAGEM_PENDENCIA_REPASSE.saque_travado}</p>
                  </div>
                ) : faltaParaOSaque.length > 0 && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 space-y-1" data-testid="falta-para-o-saque">
                    <p className="font-medium text-foreground">Falta para pedir o saque</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {faltaParaOSaque.map((p) => <li key={p}>{MENSAGEM_PENDENCIA_REPASSE[p]}</li>)}
                    </ul>
                  </div>
                )}
                {!saqueTravado && faltaParaOSaque.length === 0 && !hasPin && meuPin && (
                  <div className="rounded-lg border p-3 flex gap-2" data-testid="aviso-pin-no-saque">
                    <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p>
                      <span className="font-medium text-foreground">{AVISO_PIN.titulo}.</span> Ele protege a conta que recebe os seus repasses. Você pode pedir este saque agora e criar o PIN depois.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isSubmitting}>Voltar</AlertDialogCancel>
            {saqueTravado ? null : faltaParaOSaque.length > 0 ? (
              <AlertDialogAction
                onClick={() => {
                  setSelectedEvent(null);
                  if (faltaParaOSaque.some((p) => PENDENCIA_EM_CONFIGURACOES.includes(p))) navigate('/produtor/configuracoes');
                  else setAba('dados');
                }}
              >
                {faltaParaOSaque.some((p) => PENDENCIA_EM_CONFIGURACOES.includes(p)) ? 'Ir para Configurações' : 'Ir para Conta bancária e PIN'}
              </AlertDialogAction>
            ) : (
              <>
                {!hasPin && meuPin && (
                  <Button variant="outline" disabled={isSubmitting} onClick={() => { setSelectedEvent(null); setAba('dados'); }}>
                    {AVISO_PIN.botao}
                  </Button>
                )}
                <AlertDialogAction
                  disabled={isSubmitting || contaCarregando || contaRelendo}
                  onClick={(e) => { e.preventDefault(); handleConfirmPayout(); }}
                >
                  {isSubmitting ? 'Solicitando...' : 'Confirmar saque'}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProducerLayout>
  );
}
