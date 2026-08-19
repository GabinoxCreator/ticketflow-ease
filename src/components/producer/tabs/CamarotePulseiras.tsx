import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Printer, Check, Loader2, Search, RotateCcw, PackageCheck, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { VocabularioAssento } from '@/lib/vocabularioAssento';

/*
 * Fila de pulseiras do camarote.
 *
 * A entrega é no balcão: imprimimos aqui e o cliente vem retirar. O que essa
 * tela resolve é o que dói na véspera — saber o que já foi impresso e o que já
 * foi entregue. Sem isso, imprime-se duas vezes, ou o cliente chega e ninguém
 * sabe se ele já passou.
 *
 * Três estados, nesta ordem: a imprimir → impresso → entregue. Camarote vendido
 * depois que o lote foi impresso nasce em "a imprimir" e volta sozinho para a
 * fila.
 *
 * A quantidade de pulseiras é o número de ingressos EMITIDOS para o camarote,
 * não a capacidade cadastrada: o comprador pode ter fechado com menos gente do
 * que o espaço comporta.
 */

interface Linha {
  seat_id: string;
  code: string | null;
  label: string | null;
  seat_type_name: string | null;
  quantidade: number;
  order_id: string;
  comprador: string | null;
  comprador_email: string | null;
  comprador_telefone: string | null;
  pago_em: string | null;
  valor: number | null;
  printed_at: string | null;
  delivered_at: string | null;
  delivered_to: string | null;
}

interface Props {
  eventId: string;
  eventTitle: string;
  v: VocabularioAssento;
}

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function CamarotePulseiras({ eventId, eventTitle, v }: Props) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [entregaAberta, setEntregaAberta] = useState(false);
  const [retiradoPor, setRetiradoPor] = useState('');
  const [imprimindo, setImprimindo] = useState<Linha[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['camarote-pulseiras', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await (supabase.rpc as any)('get_camarote_wristbands', { _event_id: eventId });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const linhas = data ?? [];

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((l) =>
      [l.code, l.label, l.comprador, l.comprador_email, l.seat_type_name]
        .some((c) => (c ?? '').toLowerCase().includes(q)),
    );
  }, [linhas, busca]);

  const aImprimir = linhas.filter((l) => !l.printed_at);
  const impressos = linhas.filter((l) => l.printed_at && !l.delivered_at);
  const entregues = linhas.filter((l) => l.delivered_at);
  const totalPulseiras = linhas.reduce((s, l) => s + l.quantidade, 0);

  const marcar = useMutation({
    mutationFn: async ({ ids, acao, quem }: { ids: string[]; acao: string; quem?: string }) => {
      const { data, error } = await (supabase.rpc as any)('marcar_pulseiras', {
        _seat_ids: ids, _acao: acao, _retirado_por: quem ?? null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camarote-pulseiras', eventId] });
      setMarcados(new Set());
    },
    onError: (e: any) => {
      const m = e?.message ?? '';
      if (m.includes('forbidden')) toast.error('Você não tem permissão para isto.');
      else toast.error('Não foi possível salvar. Tente de novo.');
    },
  });

  const alternar = (id: string) => {
    setMarcados((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selecionados = linhas.filter((l) => marcados.has(l.seat_id));

  /** Abre a folha de impressão e marca como impresso ao voltar. */
  const imprimir = (linhasParaImprimir: Linha[]) => {
    if (!linhasParaImprimir.length) return;
    setImprimindo(linhasParaImprimir);
    // Espera a folha entrar na tela antes de chamar a impressão do navegador.
    setTimeout(() => {
      window.print();
      setImprimindo(null);
      marcar.mutate(
        { ids: linhasParaImprimir.map((l) => l.seat_id), acao: 'imprimir' },
        { onSuccess: () => toast.success(`${linhasParaImprimir.length} ${linhasParaImprimir.length === 1 ? v.singular : v.plural} marcad${v.genero}${linhasParaImprimir.length === 1 ? '' : 's'} como impress${v.genero}${linhasParaImprimir.length === 1 ? '' : 's'}.`) },
      );
    }, 400);
  };

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (linhas.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <PackageCheck className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="font-semibold">Nenhum {v.singular} vendido ainda</p>
          <p className="text-sm text-muted-foreground">
            Assim que uma venda for confirmada, {v.artigo} {v.singular} aparece aqui para imprimir as pulseiras.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* A folha de impressão: só existe no papel. Some da tela e leva o resto
          do painel junto quando o navegador imprime. */}
      {imprimindo && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-8 z-[9999]">
          <h1 className="text-2xl font-bold mb-1">{eventTitle}</h1>
          <p className="text-sm mb-6">Pulseiras · {imprimindo.length} {imprimindo.length === 1 ? v.singular : v.plural}</p>
          {imprimindo.map((l) => (
            <div key={l.seat_id} className="border-2 border-black rounded p-4 mb-4 break-inside-avoid">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-3xl font-black leading-none">{l.label ?? l.code}</p>
                  {l.seat_type_name && <p className="text-lg">{l.seat_type_name}</p>}
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black leading-none">{l.quantidade}</p>
                  <p className="text-xs uppercase tracking-wide">pulseiras</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-black/30 text-sm">
                <p><strong>Comprador:</strong> {l.comprador ?? '—'}</p>
                {l.comprador_telefone && <p><strong>Contato:</strong> {l.comprador_telefone}</p>}
                <p><strong>Valor:</strong> {brl(Number(l.valor ?? 0))}</p>
                <p className="mt-2 text-xs">Retirado por: _______________________________  Data: ____/____</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">A imprimir</p>
          <p className="text-2xl font-bold">{aImprimir.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Impressos</p>
          <p className="text-2xl font-bold">{impressos.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Entregues</p>
          <p className="text-2xl font-bold text-emerald-400">{entregues.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Pulseiras no total</p>
          <p className="text-2xl font-bold">{totalPulseiras}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={`Buscar por ${v.singular}, comprador ou e-mail…`}
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {aImprimir.length > 0 && (
          <Button variant="hero" onClick={() => imprimir(aImprimir)}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir todas as pendentes ({aImprimir.length})
          </Button>
        )}
      </div>

      <div className="space-y-2 print:hidden">
        {filtradas.map((l) => {
          const estado = l.delivered_at ? 'entregue' : l.printed_at ? 'impresso' : 'fila';
          return (
            <Card key={l.seat_id} className={marcados.has(l.seat_id) ? 'border-primary/60' : ''}>
              <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary cursor-pointer"
                  checked={marcados.has(l.seat_id)}
                  onChange={() => alternar(l.seat_id)}
                  aria-label={`Selecionar ${l.label ?? l.code}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{l.label ?? l.code}</span>
                    {l.seat_type_name && (
                      <span className="text-xs text-muted-foreground">{l.seat_type_name}</span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {l.quantidade} {l.quantidade === 1 ? 'pulseira' : 'pulseiras'}
                    </Badge>
                    {estado === 'entregue' && (
                      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">
                        <Check className="w-3 h-3 mr-1" /> Entregue
                      </Badge>
                    )}
                    {estado === 'impresso' && (
                      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
                        <Printer className="w-3 h-3 mr-1" /> Impresso
                      </Badge>
                    )}
                    {estado === 'fila' && (
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="w-3 h-3 mr-1" /> A imprimir
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {l.comprador ?? '—'}
                    {l.comprador_telefone ? ` · ${l.comprador_telefone}` : ''}
                    {' · '}{brl(Number(l.valor ?? 0))}
                  </p>
                  {l.delivered_at && (
                    <p className="text-[11px] text-emerald-400/80">
                      Retirado por {l.delivered_to ?? 'não informado'} em {dataHora(l.delivered_at)}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" className="shrink-0"
                  onClick={() => imprimir([l])}>
                  <Printer className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Barra do que está marcado. Fixa, porque a lista fica longa e as ações
          precisam estar à mão enquanto o cliente espera no balcão. */}
      {selecionados.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-[272px] z-50 rounded-2xl border-2 border-primary/60 bg-card/95 backdrop-blur px-4 py-3 shadow-xl shadow-primary/20 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="font-semibold text-sm">
              {selecionados.length} {selecionados.length === 1 ? v.singular : v.plural} · {selecionados.reduce((s, l) => s + l.quantidade, 0)} pulseiras
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>Limpar</Button>
              <Button variant="outline" size="sm"
                onClick={() => marcar.mutate({ ids: selecionados.map((l) => l.seat_id), acao: 'reimprimir' },
                  { onSuccess: () => toast.success('Devolvidos para a fila de impressão.') })}>
                <RotateCcw className="w-4 h-4 mr-2" /> Voltar para a fila
              </Button>
              <Button variant="outline" size="sm" onClick={() => imprimir(selecionados)}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
              <Button variant="hero" size="sm" onClick={() => { setRetiradoPor(''); setEntregaAberta(true); }}>
                <Check className="w-4 h-4 mr-2" /> Marcar entregue
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={entregaAberta} onOpenChange={setEntregaAberta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar entrega</DialogTitle>
            <DialogDescription>
              {selecionados.length} {selecionados.length === 1 ? v.singular : v.plural} ·{' '}
              {selecionados.reduce((s, l) => s + l.quantidade, 0)} pulseiras
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium" htmlFor="retirado-por">Quem retirou</label>
              <Input id="retirado-por" placeholder="Nome de quem está levando"
                value={retiradoPor} onChange={(e) => setRetiradoPor(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Fica registrado com data e hora — é o que responde “quem pegou?” depois.
              </p>
            </div>
            <Button variant="hero" className="w-full" disabled={marcar.isPending}
              onClick={() => marcar.mutate(
                { ids: selecionados.map((l) => l.seat_id), acao: 'entregar', quem: retiradoPor },
                { onSuccess: () => { setEntregaAberta(false); toast.success('Entrega registrada.'); } },
              )}>
              {marcar.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</> : 'Confirmar entrega'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
