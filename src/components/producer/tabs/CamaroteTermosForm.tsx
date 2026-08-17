import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Minus, Plus, Copy, Check, Loader2, Link2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { EventTableRow } from '@/hooks/useEventTables';

/**
 * Fechar a venda de UMA unidade e sair com o link pronto para mandar.
 *
 * A venda de camarote é negociada por telefone ou WhatsApp: o produtor está com o
 * comprador na linha e precisa acertar quantidade e valor na hora, ver o total e
 * mandar o link. Por isso a tela é de operação, não de cadastro — os ingressos
 * mudam no + e no −, o total aparece enquanto ele digita, e o link nasce no mesmo
 * botão que salva.
 *
 * Grava via `set_event_seat_terms` em `event_seats` — os mesmos campos de que o
 * checkout cobra, então o que ele fecha aqui é exatamente o que o comprador paga.
 */

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(v) ? v : 0,
  );

/** "1.234,56" ou "1234.56" → 1234.56. Aceita o que o produtor digitar. */
function paraNumero(txt: string): number {
  const limpo = txt.replace(/\s/g, '');
  if (!limpo) return NaN;
  // Se tem vírgula, ela é o separador decimal e o ponto é milhar.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  return Number(normalizado);
}

interface Props {
  table: EventTableRow;
  eventId: string;
  onSaved: () => void;
}

export function CamaroteTermosForm({ table, eventId, onSaved }: Props) {
  const padrao = table.base_capacity ?? 10;
  const teto = table.max_capacity ?? Math.max(padrao * 2, padrao);

  const [qtd, setQtd] = useState<number>(padrao);
  const [valorTxt, setValorTxt] = useState<string>(
    table.base_price ? String(table.base_price).replace('.', ',') : '',
  );
  const [extraTxt, setExtraTxt] = useState<string>(
    table.extra_price ? String(table.extra_price).replace('.', ',') : '',
  );
  const [salvo, setSalvo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const valor = paraNumero(valorTxt);
  const extraUnit = paraNumero(extraTxt || '0');
  const acima = Math.max(0, qtd - padrao);
  const totalExtra = acima > 0 && Number.isFinite(extraUnit) ? acima * extraUnit : 0;
  const total = (Number.isFinite(valor) ? valor : 0) + totalExtra;

  const valido = qtd >= 1 && Number.isFinite(valor) && valor >= 0;

  const link = useMemo(
    () => `${window.location.origin}/evento/${eventId}/mapa?unidade=${encodeURIComponent(table.code ?? '')}`,
    [eventId, table.code],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      // O valor gravado é o TOTAL: é ele que o checkout cobra. Guardar só o valor
      // do camarote deixaria os ingressos a mais de fora da cobrança.
      const { data, error } = await (supabase.rpc as any)('set_event_seat_terms', {
        _seat_id: table.id,
        _base_capacity: qtd,
        _base_price: total,
        _extra_price: Number.isFinite(extraUnit) ? extraUnit : 0,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setSalvo(true);
      onSaved();
      toast.success('Combinado salvo. O link já pode ser enviado.');
    },
    onError: (e: unknown) => {
      const msg = (e as { message?: string })?.message ?? '';
      if (msg.includes('seat_busy')) toast.error('Esta unidade já está vendida ou em checkout.');
      else if (msg.includes('forbidden')) toast.error('Você não tem permissão para alterar esta unidade.');
      else toast.error('Não foi possível salvar. Confira os valores.');
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

  const textoWhats = `Olá! Segue o link do ${table.label ?? table.code} (${table.seat_type_name ?? 'Camarote'}) no Novo Horizonte Rodeio 2026.\n\n${qtd} ingressos por dia · 5 noites\nValor: ${brl(total)}\n\n${link}`;
  const whats = `https://wa.me/?text=${encodeURIComponent(textoWhats)}`;

  return (
    <div className="space-y-4">
      {/* Ingressos: + e − porque o produtor está com o comprador na linha e
          mexe nisso enquanto conversa. Digitar número é mais lento e erra mais. */}
      <div className="space-y-2">
        <Label className="text-xs">Ingressos por dia</Label>
        <div className="flex items-center gap-3">
          <Button
            type="button" variant="outline" size="icon"
            onClick={() => setQtd((n) => Math.max(1, n - 1))}
            disabled={qtd <= 1}
            aria-label="Um ingresso a menos"
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="flex-1 text-center">
            <div className="text-3xl font-bold tabular-nums leading-none">{qtd}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {qtd === padrao
                ? `padrão do ${table.seat_type_name ?? 'piso'}`
                : acima > 0
                  ? `${acima} acima do padrão (${padrao})`
                  : `${padrao - qtd} abaixo do padrão (${padrao})`}
            </div>
          </div>

          <Button
            type="button" variant="outline" size="icon"
            onClick={() => setQtd((n) => Math.min(teto, n + 1))}
            disabled={qtd >= teto}
            aria-label="Um ingresso a mais"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">
          Valem para as 5 noites · máximo {teto}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="valor" className="text-xs">Valor do camarote (R$)</Label>
        <Input
          id="valor" inputMode="decimal" placeholder="9.000,00"
          value={valorTxt}
          onChange={(e) => { setValorTxt(e.target.value.replace(/[^\d.,]/g, '')); setSalvo(false); }}
        />
      </div>

      {/* Só aparece quando passa do padrão — campo que não se aplica só polui. */}
      {acima > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <Label htmlFor="extra" className="text-xs">
            Combinado por ingresso a mais (R$)
          </Label>
          <Input
            id="extra" inputMode="decimal" placeholder="0,00"
            value={extraTxt}
            onChange={(e) => { setExtraTxt(e.target.value.replace(/[^\d.,]/g, '')); setSalvo(false); }}
          />
          <p className="text-[11px] text-muted-foreground">
            {acima} × {brl(Number.isFinite(extraUnit) ? extraUnit : 0)} = <strong>{brl(totalExtra)}</strong>
          </p>
        </div>
      )}

      {/* Total: o número que o produtor fala em voz alta ao telefone. */}
      <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Total a cobrar</span>
          <span className="text-2xl font-bold tabular-nums">{brl(total)}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {table.label ?? table.code} · {table.seat_type_name} · {qtd} ingressos por dia · 5 noites
        </div>
      </div>

      <Button
        onClick={() => salvar.mutate()}
        disabled={!valido || salvar.isPending}
        className="w-full" size="lg"
      >
        {salvar.isPending
          ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</>)
          : (<><Link2 className="h-4 w-4 mr-2" />Salvar e gerar link</>)}
      </Button>

      {/* O link só aparece depois de salvar: mandar um link cujo valor ainda não
          foi gravado entregaria ao comprador um preço diferente do combinado. */}
      {salvo && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="text-xs font-medium">Link para o comprador</div>
          <p className="text-[11px] text-muted-foreground">
            Abre o mapa já neste camarote, com o valor e os ingressos combinados.
          </p>
          <Input readOnly value={link} className="text-xs"
                 onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copiar} className="flex-1">
              {copiado ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
            <Button type="button" variant="outline" asChild className="flex-1">
              <a href={whats} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
