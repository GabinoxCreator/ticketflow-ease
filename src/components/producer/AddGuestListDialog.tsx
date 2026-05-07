import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useGuestListMutations } from '@/hooks/useGuestLists';
import { toast } from 'sonner';
import {
  Clock,
  Link as LinkIcon,
  Users,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  ChevronDown,
  Tag,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddGuestListDialogProps {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTime?: string | null;
  onListCreated?: (list: { name: string; slug: string }) => void;
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_MAX = 40;

function maskTime(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function subtractMinutes(time: string, minutes: number): string | null {
  const m = time.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  let total = parseInt(m[1]) * 60 + parseInt(m[2]) - minutes;
  if (total < 0) total += 24 * 60;
  const h = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const HALF_HOUR_OPTIONS: string[] = (() => {
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return arr;
})();

interface CreatedInfo {
  name: string;
  slug: string;
}

function SectionHeader({ index, label }: { index: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <span className="h-5 w-5 rounded-full bg-muted/60 border border-border flex items-center justify-center text-[10px] text-foreground/80">
          {index}
        </span>
        {label}
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

export function AddGuestListDialog({
  eventId,
  open,
  onOpenChange,
  eventTime,
  onListCreated,
}: AddGuestListDialogProps) {
  const [name, setName] = useState('');
  const [validUntilTime, setValidUntilTime] = useState('23:00');
  const [timeTouched, setTimeTouched] = useState(false);
  const [maxGuests, setMaxGuests] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [timePopoverOpen, setTimePopoverOpen] = useState(false);
  const selectedTimeRef = useRef<HTMLButtonElement | null>(null);

  const { createList } = useGuestListMutations();

  const timeValid = TIME_REGEX.test(validUntilTime);
  const showTimeError = timeTouched && !timeValid;
  const nameTrim = name.trim();
  const canSubmit = nameTrim.length > 0 && timeValid && !isSubmitting;

  const eventStart = useMemo(() => {
    if (!eventTime) return null;
    const m = eventTime.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
  }, [eventTime]);

  const smartPresets = useMemo(() => {
    if (!eventStart) return [];
    const out: { label: string; value: string }[] = [
      { label: `Início (${eventStart})`, value: eventStart },
    ];
    const m1 = subtractMinutes(eventStart, 60);
    const m2 = subtractMinutes(eventStart, 120);
    if (m1) out.push({ label: '1h antes', value: m1 });
    if (m2) out.push({ label: '2h antes', value: m2 });
    return out;
  }, [eventStart]);

  const genericPresets = ['18:00', '20:00', '22:00', '23:59'];

  const resetForm = () => {
    setName('');
    setValidUntilTime('23:00');
    setMaxGuests('');
    setCreated(null);
    setCopied(false);
    setTimeTouched(false);
  };

  useEffect(() => {
    if (!open) {
      const t = setTimeout(resetForm, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Auto-scroll to selected time when popover opens
  useEffect(() => {
    if (timePopoverOpen) {
      requestAnimationFrame(() => {
        selectedTimeRef.current?.scrollIntoView({ block: 'center' });
      });
    }
  }, [timePopoverOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await createList.mutateAsync({
        event_id: eventId,
        name: nameTrim,
        valid_until_time: validUntilTime,
        max_guests: maxGuests ? parseInt(maxGuests) : null,
      });
      toast.success('Lista criada com sucesso!');
      setCreated({ name: result.name, slug: result.public_slug });
    } catch (error) {
      toast.error('Erro ao criar lista');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    const url = `${window.location.origin}/lista/${created.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const limitNum = maxGuests ? parseInt(maxGuests) : null;

  // Closest half-hour for popover highlight
  const nearestHalfHour = useMemo(() => {
    if (!timeValid) return '20:00';
    const [h, m] = validUntilTime.split(':').map(Number);
    const rounded = m < 15 ? 0 : m < 45 ? 30 : 0;
    const hour = m >= 45 ? (h + 1) % 24 : h;
    return `${String(hour).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
  }, [validUntilTime, timeValid]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <div className="py-2">
            <div className="flex flex-col items-center text-center gap-3 pt-2 pb-4">
              <div className="h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Lista criada com sucesso</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Compartilhe o link abaixo com seus convidados
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Link público
              </div>
              <div className="font-mono text-xs break-all text-foreground/90">
                {`${window.location.origin}/lista/${created.slug}`}
              </div>
            </div>

            <Button onClick={handleCopy} className="w-full mt-4" size="lg">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" /> Link copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" /> Copiar link
                </>
              )}
            </Button>

            {onListCreated && (
              <Button
                type="button"
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  onListCreated(created);
                  onOpenChange(false);
                }}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                Abrir gerenciamento da lista
              </Button>
            )}

            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => resetForm()}
              >
                Criar outra
              </Button>
              <Button
                type="button"
                variant={onListCreated ? 'ghost' : 'outline'}
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Concluir
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20 shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <DialogTitle>Nova lista de cortesia</DialogTitle>
                  <DialogDescription className="mt-0.5">
                    Configure quem pode entrar e até quando o link funciona.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 py-5">
              {/* Seção 1 — Identificação */}
              <section className="space-y-3">
                <SectionHeader index={1} label="Identificação" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Nome da lista
                    </Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {name.length}/{NAME_MAX}
                    </span>
                  </div>
                  <Input
                    id="name"
                    placeholder="VIP, Imprensa, Aniversariantes…"
                    value={name}
                    maxLength={NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Aparece para os convidados ao se inscreverem.
                  </p>
                </div>
              </section>

              {/* Seção 2 — Regras */}
              <section className="space-y-4">
                <SectionHeader index={2} label="Regras da lista" />

                {/* Horário */}
                <div className="space-y-2">
                  <Label htmlFor="validUntil" className="text-sm font-medium">
                    Válida até (horário)
                  </Label>

                  <Popover open={timePopoverOpen} onOpenChange={setTimePopoverOpen}>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                      <Input
                        id="validUntil"
                        inputMode="numeric"
                        placeholder="HH:MM"
                        value={validUntilTime}
                        onChange={(e) => setValidUntilTime(maskTime(e.target.value))}
                        onBlur={() => setTimeTouched(true)}
                        onFocus={() => setTimePopoverOpen(true)}
                        aria-invalid={showTimeError}
                        className={cn(
                          'pl-9 pr-20 font-mono tabular-nums h-11 text-base',
                          showTimeError && 'border-destructive/60 focus-visible:ring-destructive/30',
                        )}
                      />
                      {showTimeError && (
                        <AlertCircle className="absolute right-12 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                      )}
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-9 px-2 gap-1 text-muted-foreground hover:text-foreground"
                          aria-label="Escolher horário"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                    </div>
                    <PopoverContent
                      align="end"
                      className="w-44 p-1"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <div className="max-h-56 overflow-y-auto py-1" role="listbox">
                        {HALF_HOUR_OPTIONS.map((t) => {
                          const isSelected = t === nearestHalfHour;
                          return (
                            <button
                              key={t}
                              ref={isSelected ? selectedTimeRef : undefined}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setValidUntilTime(t);
                                setTimeTouched(true);
                                setTimePopoverOpen(false);
                              }}
                              className={cn(
                                'w-full text-left px-3 py-1.5 rounded-md text-sm font-mono tabular-nums transition-colors',
                                isSelected
                                  ? 'bg-primary/15 text-primary font-semibold'
                                  : 'hover:bg-muted text-foreground/90',
                              )}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Smart presets */}
                  {smartPresets.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Sugestões do evento
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {smartPresets.map((p) => (
                          <button
                            key={`s-${p.label}`}
                            type="button"
                            onClick={() => {
                              setValidUntilTime(p.value);
                              setTimeTouched(true);
                            }}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                              validUntilTime === p.value
                                ? 'bg-primary/15 border-primary/40 text-primary'
                                : 'bg-primary/5 border-primary/20 text-primary/90 hover:bg-primary/10',
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Horários comuns
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {genericPresets.map((v) => (
                        <button
                          key={`g-${v}`}
                          type="button"
                          onClick={() => {
                            setValidUntilTime(v);
                            setTimeTouched(true);
                          }}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-xs font-mono tabular-nums border transition-colors',
                            validUntilTime === v
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-muted/40 border-border hover:border-primary/40 hover:text-primary',
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground pt-1">
                    Horário máximo, na data do evento, em que novos convidados podem se inscrever.
                  </p>
                </div>

                {/* Limite */}
                <div className="space-y-2">
                  <Label htmlFor="maxGuests" className="text-sm font-medium">
                    Limite de convidados{' '}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="maxGuests"
                      type="number"
                      min="1"
                      placeholder="Sem limite"
                      value={maxGuests}
                      onChange={(e) => setMaxGuests(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  {limitNum ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <Check className="h-3 w-3" /> Máximo de {limitNum} convidados
                    </span>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para ilimitado.
                    </p>
                  )}
                </div>
              </section>

              {/* Seção 3 — Compartilhamento */}
              <section className="space-y-3">
                <SectionHeader index={3} label="Compartilhamento" />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                  Um link público será gerado automaticamente após criar a lista.
                </p>
              </section>

              {/* Resumo */}
              <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                  Resumo
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <SummaryPill
                    icon={<Tag className="h-3 w-3" />}
                    label="Nome"
                    value={nameTrim || '—'}
                    muted={!nameTrim}
                  />
                  <SummaryPill
                    icon={<Clock className="h-3 w-3" />}
                    label="Válida até"
                    value={timeValid ? validUntilTime : '—'}
                    muted={!timeValid}
                    invalid={showTimeError}
                  />
                  <SummaryPill
                    icon={<Users className="h-3 w-3" />}
                    label="Limite"
                    value={limitNum ? `${limitNum}` : 'Sem limite'}
                    muted={!limitNum}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting ? 'Criando...' : 'Criar e gerar link'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryPill({
  icon,
  label,
  value,
  muted,
  invalid,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 px-2 py-1.5 rounded-md bg-card border min-w-0',
        invalid ? 'border-destructive/40' : 'border-border/60',
      )}
    >
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'text-xs font-medium truncate',
          muted ? 'text-muted-foreground' : 'text-foreground',
          invalid && 'text-destructive',
        )}
      >
        {value}
      </div>
    </div>
  );
}
