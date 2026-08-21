import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Minus, Plus, Copy, Check, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { EventTableRow } from '@/hooks/useEventTables';
import type { VocabularioAssento } from '@/lib/vocabularioAssento';

/**
 * Fechar a venda de VÁRIAS unidades de uma vez e sair com UM link.
 *
 * A negociação de camarote acontece no telefone e costuma levar mais de um.
 * Fechar um de cada vez e mandar dois links é o caminho mais curto para o
 * comprador pagar o primeiro, esquecer o segundo, e o produtor descobrir na
 * véspera.
 *
 * ⚠️ CADA UNIDADE TEM O SEU PREÇO. No rodeio o valor muda por piso — 9.000 no A,
 * 8.000 no B, 7.000 no C. Um campo único para o pacote apagaria essa tabela na
 * primeira venda. Então o padrão é manter o preço de cada um; quem quiser dar um
 * valor fechado para o pacote usa o campo de igualar, que é uma escolha
 * explícita e mostra o antes e o depois.
 */

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(v) ? v : 0,
  );

/** "1.234,56" ou "1234.56" → 1234.56. Aceita o que o produtor digitar. */
function paraNumero(txt: string): number {
  const limpo = txt.replace(/\s/g, '');
  if (!limpo) return NaN;
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  return Number(normalizado);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seats: EventTableRow[];
  eventId: string;
  eventTitle: string;
  v: VocabularioAssento;
  /** Noites do evento. É o que vira o total de pulseiras a imprimir. */
  noites?: number;
  onSaved: () => void;
}

export function FecharVendaEmLote({ open, onOpenChange, seats, eventId, eventTitle, v, noites = 0, onSaved }: Props) {
  const [qtd, setQtd] = useState<number>(10);
  /** Vazio = cada unidade mantém o próprio preço. */
  const [igualarTxt, setIgualarTxt] = useState<string>('');
  const [extraTxt, setExtraTxt] = useState<string>('');
  const [salvo, setSalvo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Prepara os campos quando o diálogo ABRE — e só então.
  //
  // ⚠️ `seats` NÃO entra nas dependências de propósito: salvar invalida a
  // consulta das unidades, a lista muda de referência, e o efeito rodava de
  // novo zerando `salvo` — o link recém-gerado sumia da tela e voltava o botão
  // de salvar, como se nada tivesse acontecido.
  useEffect(() => {
    if (!open || seats.length === 0) return;
    setQtd(seats[0].base_capacity ?? 10);
    setIgualarTxt('');
    setExtraTxt(seats[0].extra_price ? String(seats[0].extra_price).replace('.', ',') : '');
    setSalvo(false);
    setCopiado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const igualar = paraNumero(igualarTxt);
  const usarValorUnico = igualarTxt.trim().length > 0 && Number.isFinite(igualar) && igualar >= 0;
  const extraUnit = paraNumero(extraTxt || '0');

  /** Quanto cada unidade vai custar depois de salvar. */
  const precos = useMemo(() => {
    const padrao = seats[0]?.base_capacity ?? 10;
    const acima = Math.max(0, qtd - padrao);
    const extra = acima > 0 && Number.isFinite(extraUnit) ? acima * extraUnit : 0;
    return seats.map((s) => {
      const base = usarValorUnico ? igualar : Number(s.base_price ?? 0);
      return { seat: s, antes: Number(s.base_price ?? 0), depois: base + extra };
    });
  }, [seats, usarValorUnico, igualar, qtd, extraUnit]);

  const totalPacote = precos.reduce((soma, p) => soma + p.depois, 0);
  const algumSemPreco = precos.some((p) => !(p.depois > 0));
  const valido = qtd >= 1 && seats.length > 0 && !algumSemPreco;

  // Um link só, com todas as unidades: o mapa do comprador abre com o pacote
  // montado, ele confere e paga numa transação.
  const link = useMemo(() => {
    const codigos = seats.map((s) => s.code).filter(Boolean).join(',');
    return `${window.location.origin}/evento/${eventId}/mapa?unidades=${encodeURIComponent(codigos)}`;
  }, [eventId, seats]);

  const salvar = useMutation({
    mutationFn: async () => {
      // Uma chamada por unidade: a RPC valida cada uma (não pode estar vendida
      // nem em checkout) e garante que quem salva é o dono do evento.
      for (const p of precos) {
        const { error } = await (supabase.rpc as any)('set_event_seat_terms', {
          _seat_id: p.seat.id,
          _base_capacity: qtd,
          _base_price: p.depois,
          _extra_price: Number.isFinite(extraUnit) ? extraUnit : 0,
        });
        if (error) throw Object.assign(error, { unidade: p.seat.label ?? p.seat.code });
      }
    },
    onSuccess: () => {
      setSalvo(true);
      onSaved();
      toast.success(`Combinado salvo para ${seats.length} ${seats.length === 1 ? v.singular : v.plural}.`);
    },
    onError: (e: any) => {
      const msg = e?.message ?? '';
      const onde = e?.unidade ? ` (${e.unidade})` : '';
      if (msg.includes('seat_busy')) toast.error(`Uma das unidades já está vendida ou em checkout${onde}.`);
      else if (msg.includes('forbidden')) toast.error('Você não tem permissão para alterar estas unidades.');
      else toast.error(`Não foi possível salvar${onde}. Confira os valores.`);
    },
  });

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success('Link copiado.');
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('Não consegui copiar. Selecione o endereço e copie na mão.');
    }
  };

  const nomes = seats.map((s) => s.label ?? s.code).join(', ');
  const textoWhats = `Olá! Segue o link para ${seats.length === 1 ? `o ${v.singular}` : `os ${seats.length} ${v.plural}`} ${nomes} no ${eventTitle}.\n\n`
    + `${qtd} ingressos por dia em cada ${v.singular} · 5 noites\n`
    + `Total: ${brl(totalPacote)}\n\n${link}`;
  const whats = `https://wa.me/?text=${encodeURIComponent(textoWhats)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Fechar venda · {seats.length} {seats.length === 1 ? v.singular : v.plural}
          </DialogTitle>
          <DialogDescription className="truncate">{nomes}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Ingressos por dia, em cada {v.singular}</Label>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="icon"
                onClick={() => setQtd((n) => Math.max(1, n - 1))} disabled={salvo}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center font-semibold text-lg tabular-nums">{qtd}</span>
              <Button type="button" variant="outline" size="icon"
                onClick={() => setQtd((n) => n + 1)} disabled={salvo}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {/* A conta por extenso. O campo é POR NOITE e POR UNIDADE — sem ver
                o total, é fácil digitar aqui o número que se tem em mente para o
                pacote inteiro. Aconteceu na primeira venda (20/08): 40 no campo
                viraram 40 em cada um dos 4, não 10 em cada. */}
            {qtd > 0 && seats.length > 0 && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {seats.length} {seats.length === 1 ? v.singular : v.plural} × <strong className="text-foreground">{qtd}</strong> por noite
                {noites > 0 && <> × {noites} noites</>}
                {' = '}
                <strong className="text-foreground">
                  {qtd * seats.length * (noites > 0 ? noites : 1)} pulseiras
                </strong> a imprimir
                {noites > 0 && <> ({qtd * noites} por {v.singular})</>}.
              </p>
            )}
          </div>

          {/* Preço de cada unidade — no rodeio ele muda por piso, e ver a lista
              evita fechar um pacote no valor errado sem perceber. */}
          <div className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/50">
            {precos.map((p) => (
              <div key={p.seat.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{p.seat.label ?? p.seat.code}</p>
                  {p.seat.seat_type_name && (
                    <p className="text-[11px] text-muted-foreground truncate">{p.seat.seat_type_name}</p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-3">
                  {usarValorUnico && p.antes !== p.depois && (
                    <span className="text-[11px] text-muted-foreground line-through mr-1.5">{brl(p.antes)}</span>
                  )}
                  <span className="tabular-nums font-medium">{brl(p.depois)}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 font-semibold">
              <span>Total do pacote</span>
              <span className="tabular-nums text-base">{brl(totalPacote)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">
              Valor fechado para cada {v.singular} <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input inputMode="decimal" placeholder="deixe vazio para manter o preço de cada um"
              value={igualarTxt} onChange={(e) => setIgualarTxt(e.target.value)} disabled={salvo} />
            <p className="text-[11px] text-muted-foreground">
              Só preencha se combinou um valor único. Vazio, cada {v.singular} mantém o preço do piso.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Valor do ingresso adicional <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input inputMode="decimal" placeholder="0,00" value={extraTxt}
              onChange={(e) => setExtraTxt(e.target.value)} disabled={salvo} />
          </div>

          {algumSemPreco && !salvo && (
            <p className="text-xs text-amber-400">
              Alguma unidade está sem preço. Informe um valor fechado para o pacote.
            </p>
          )}

          {!salvo ? (
            <Button variant="hero" className="w-full h-12" disabled={!valido || salvar.isPending}
              onClick={() => salvar.mutate()}>
              {salvar.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</>
                : 'Salvar e gerar link'}
            </Button>
          ) : (
            <div className="space-y-3">
              {/* Confirmação, não um endereço cru na cara do produtor. O link é
                  meio, não resultado: ele quer saber que a venda foi montada e
                  mandar para o cliente (Gabriel, 20/08). */}
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
                <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <p className="font-display font-semibold text-base">Venda montada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {seats.length} {seats.length === 1 ? v.singular : v.plural} · {brl(totalPacote)}
                </p>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Agora é só mandar o link para o cliente. {seats.length === 1 ? `${v.artigoMaiusculo} ${v.singular} fica` : `${v.Plural} ficam`} reservad{v.genero}{seats.length === 1 ? '' : 's'} enquanto ele estiver pagando.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={copiar}>
                  {copiado ? <><Check className="w-4 h-4 mr-2" /> Copiado</> : <><Copy className="w-4 h-4 mr-2" /> Copiar link</>}
                </Button>
                <Button variant="hero" onClick={() => window.open(whats, '_blank', 'noopener')}>
                  <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
