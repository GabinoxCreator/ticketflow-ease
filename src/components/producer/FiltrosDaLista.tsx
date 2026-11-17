/**
 * Filtros das listas do evento (OS-408, etapa 5, itens 5.4 e 5.5).
 *
 * Pedidos: período, ingresso (lote), forma de pagamento e cupom. Participantes: só o
 * ingresso (lote). Quem filtra é o BANCO (painelDoEvento.ts): aqui só se escolhe. A
 * escolha de data é o calendário do projeto (o mesmo do assistente de criar evento),
 * nunca o campo de data do navegador.
 */
import { useState } from 'react';
import { format, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FiltrosDoPedido, FormaDoPedido } from '@/lib/painelDoEvento';

const TODOS = '__todos';

export interface LoteDoFiltro { id: string; name: string; sector_name?: string | null }
export interface CupomDoFiltro { id: string; code: string }

const FORMAS: { valor: FormaDoPedido; nome: string }[] = [
  { valor: 'pix', nome: 'PIX' },
  { valor: 'cartao', nome: 'Cartão' },
  { valor: 'dinheiro', nome: 'Dinheiro' },
  { valor: 'cortesia', nome: 'Cortesia' },
];

const gatilho = 'h-10 rounded-xl bg-background/50 border-border/60 text-sm';

/** Nome do lote; com o mesmo nome em setores diferentes, o setor vai junto. */
function nomeDoLote(l: LoteDoFiltro, todos: LoteDoFiltro[]) {
  const repetido = todos.filter((x) => x.name === l.name).length > 1;
  return repetido && l.sector_name ? `${l.name} · ${l.sector_name}` : l.name;
}

export function FiltroDeLote({ lotes, valor, onChange }: { lotes: LoteDoFiltro[]; valor?: string | null; onChange: (v: string | null) => void }) {
  return (
    <Select value={valor || TODOS} onValueChange={(v) => onChange(v === TODOS ? null : v)}>
      <SelectTrigger aria-label="Filtrar por ingresso" className={gatilho}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos os ingressos</SelectItem>
        {lotes.map((l) => (
          <SelectItem key={l.id} value={l.id}>{nomeDoLote(l, lotes)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Período escolhido no calendário → instantes do banco (o último dia entra inteiro). */
function periodoParaFiltro(r: DateRange | undefined): Pick<FiltrosDoPedido, 'de' | 'ate'> {
  if (!r?.from) return { de: null, ate: null };
  const fim = r.to ?? r.from;
  return { de: startOfDay(r.from).toISOString(), ate: startOfDay(addDays(fim, 1)).toISOString() };
}

function textoDoPeriodo(f: FiltrosDoPedido): string {
  if (!f.de) return 'Todo o período';
  const de = new Date(f.de);
  const ultimo = f.ate ? addDays(new Date(f.ate), -1) : de;
  const a = format(de, 'dd/MM', { locale: ptBR });
  const b = format(ultimo, 'dd/MM', { locale: ptBR });
  return a === b ? a : `${a} a ${b}`;
}

export function FiltrosDoPedidoBarra({ filtros, onChange, lotes, cupons }: {
  filtros: FiltrosDoPedido;
  onChange: (f: FiltrosDoPedido) => void;
  lotes: LoteDoFiltro[];
  cupons: CupomDoFiltro[];
}) {
  const [abertoPeriodo, setAbertoPeriodo] = useState(false);
  const periodo: DateRange | undefined = filtros.de
    ? { from: new Date(filtros.de), to: filtros.ate ? addDays(new Date(filtros.ate), -1) : undefined }
    : undefined;
  const algum = !!(filtros.de || filtros.loteId || filtros.forma || filtros.cupomId);

  return (
    <div className="grid grid-cols-2 lg:flex lg:flex-wrap gap-2 items-center">
      <Popover open={abertoPeriodo} onOpenChange={setAbertoPeriodo}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Filtrar por período"
            className={cn('justify-start font-normal lg:w-auto', gatilho, !filtros.de && 'text-muted-foreground')}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
            <span className="truncate">{textoDoPeriodo(filtros)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            locale={ptBR}
            selected={periodo}
            onSelect={(r) => {
              onChange({ ...filtros, ...periodoParaFiltro(r) });
              // Escolheu o começo e o fim: fecha. Só um dia: continua aberto para o fim.
              if (r?.from && r?.to && r.to.getTime() !== r.from.getTime()) setAbertoPeriodo(false);
            }}
            numberOfMonths={1}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      <div className="lg:w-52"><FiltroDeLote lotes={lotes} valor={filtros.loteId} onChange={(v) => onChange({ ...filtros, loteId: v })} /></div>

      <div className="lg:w-44">
        <Select value={filtros.forma || TODOS} onValueChange={(v) => onChange({ ...filtros, forma: v === TODOS ? null : (v as FormaDoPedido) })}>
          <SelectTrigger aria-label="Filtrar por forma de pagamento" className={gatilho}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as formas</SelectItem>
            {FORMAS.map((f) => <SelectItem key={f.valor} value={f.valor}>{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {cupons.length > 0 && (
        <div className="lg:w-44">
          <Select value={filtros.cupomId || TODOS} onValueChange={(v) => onChange({ ...filtros, cupomId: v === TODOS ? null : v })}>
            <SelectTrigger aria-label="Filtrar por cupom" className={gatilho}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os cupons</SelectItem>
              {cupons.map((c) => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {algum && (
        <Button variant="ghost" className="h-10 rounded-xl text-sm" onClick={() => onChange({})}>
          <X className="h-4 w-4 mr-1" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
