/**
 * Data e horário do jeito do assistente de criar evento (OS-408, etapa 5, item 5.9):
 * calendário do projeto + lista de horários (TimeSelect), em vez do campo de data do
 * navegador (que muda de cara em cada aparelho e, no celular, abre a roda de rolar).
 *
 * Fala o MESMO formato do campo antigo ('aaaa-mm-ddThh:mm', no fuso do navegador), então
 * quem usa (a janela do lote) não muda nada na conta das datas.
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimeSelect } from '@/components/producer/TimeSelect';
import { cn } from '@/lib/utils';

const HORARIOS: string[] = [];
for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) HORARIOS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

/** A lista de horários de 15 em 15, com o horário já gravado (ex.: 23:59) incluído. */
const horariosCom = (...extras: (string | undefined)[]) =>
  [...new Set([...HORARIOS, ...extras.filter((x): x is string => !!x)])].sort();

export function CampoDataHora({
  valor,
  onChange,
  horaPadrao = '00:00',
  rotuloVazio = 'Selecione',
  podeLimpar = false,
  nome,
}: {
  /** 'aaaa-mm-ddThh:mm' ou vazio. */
  valor?: string;
  onChange: (valor: string | undefined) => void;
  /** Horário que entra quando se escolhe só o dia. */
  horaPadrao?: string;
  rotuloVazio?: string;
  podeLimpar?: boolean;
  /** Nome do campo, para quem lê a tela com leitor (ex.: "Data de início"). */
  nome: string;
}) {
  const [dia, hora] = (valor || '').split('T');
  const data = dia ? new Date(`${dia}T12:00:00`) : undefined;
  const horaCurta = hora ? hora.slice(0, 5) : '';

  return (
    <div className="flex gap-2 items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={nome}
            className={cn('flex-1 justify-start text-left font-normal h-10', !data && 'text-muted-foreground')}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
            {data ? <span className="font-medium text-foreground">{format(data, 'dd/MM/yyyy')}</span> : rotuloVazio}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={data}
            onSelect={(d) => onChange(d ? `${format(d, 'yyyy-MM-dd')}T${horaCurta || horaPadrao}` : undefined)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      <div className="w-28 shrink-0">
        <TimeSelect
          value={horaCurta}
          onChange={(h) => onChange(`${dia || format(new Date(), 'yyyy-MM-dd')}T${h}`)}
          placeholder="Horário"
          options={horariosCom(horaCurta, horaPadrao)}
        />
      </div>
      {podeLimpar && valor && (
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={`Limpar ${nome.toLowerCase()}`} title={`Limpar ${nome.toLowerCase()}`} onClick={() => onChange(undefined)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
