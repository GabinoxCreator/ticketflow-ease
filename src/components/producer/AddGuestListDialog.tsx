import { useEffect, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TimeSelect } from '@/components/producer/TimeSelect';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddGuestListDialogProps {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTime?: string | null;
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

interface CreatedInfo {
  name: string;
  slug: string;
}

export function AddGuestListDialog({ eventId, open, onOpenChange, eventTime }: AddGuestListDialogProps) {
  const [name, setName] = useState('');
  const [validUntilTime, setValidUntilTime] = useState('23:00');
  const [maxGuests, setMaxGuests] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [timePopoverOpen, setTimePopoverOpen] = useState(false);

  const { createList } = useGuestListMutations();

  const timeValid = TIME_REGEX.test(validUntilTime);
  const nameTrim = name.trim();
  const canSubmit = nameTrim.length > 0 && timeValid && !isSubmitting;

  const eventStart = useMemo(() => {
    if (!eventTime) return null;
    const m = eventTime.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
  }, [eventTime]);

  const presets = useMemo(() => {
    const base = ['18:00', '20:00', '22:00', '23:59'];
    const smart: { label: string; value: string }[] = [];
    if (eventStart) {
      smart.push({ label: `Início (${eventStart})`, value: eventStart });
      const m1 = subtractMinutes(eventStart, 60);
      const m2 = subtractMinutes(eventStart, 120);
      if (m1) smart.push({ label: '1h antes', value: m1 });
      if (m2) smart.push({ label: '2h antes', value: m2 });
    }
    return {
      generic: base.map((v) => ({ label: v, value: v })),
      smart,
    };
  }, [eventStart]);

  const resetForm = () => {
    setName('');
    setValidUntilTime('23:00');
    setMaxGuests('');
    setCreated(null);
    setCopied(false);
  };

  useEffect(() => {
    if (!open) {
      // delay reset to avoid flash during close animation
      const t = setTimeout(resetForm, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

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
                variant="outline"
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
              <DialogTitle>Nova Lista de Cortesia</DialogTitle>
              <DialogDescription>
                Defina nome, validade e limite. O link público é gerado automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Seção 1 — Identificação */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="name" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Identificação
                  </Label>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {name.length}/{NAME_MAX}
                  </span>
                </div>
                <Input
                  id="name"
                  placeholder="Ex: Lista VIP, Aniversariantes, Imprensa"
                  value={name}
                  maxLength={NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Aparece para os convidados ao se inscreverem
                </p>
              </section>

              {/* Seção 2 — Regras */}
              <section className="space-y-4">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Regras da lista
                </Label>

                {/* Horário */}
                <div className="space-y-2">
                  <Label htmlFor="validUntil" className="text-sm font-medium">
                    Válida até (horário)
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="validUntil"
                      inputMode="numeric"
                      placeholder="HH:MM"
                      value={validUntilTime}
                      onChange={(e) => setValidUntilTime(maskTime(e.target.value))}
                      aria-invalid={!timeValid}
                      className={cn(
                        'pl-9 pr-12 font-mono tabular-nums',
                        timeValid
                          ? 'border-emerald-500/40 focus-visible:ring-emerald-500/30'
                          : 'border-destructive/60 focus-visible:ring-destructive/30',
                      )}
                    />
                    <Popover open={timePopoverOpen} onOpenChange={setTimePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                          aria-label="Escolher horário"
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-44 p-2">
                        <TimeSelect
                          value={timeValid ? validUntilTime : '22:00'}
                          onChange={(v) => {
                            setValidUntilTime(v);
                            setTimePopoverOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Presets */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {presets.smart.map((p) => (
                      <button
                        key={`s-${p.value}-${p.label}`}
                        type="button"
                        onClick={() => setValidUntilTime(p.value)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                          validUntilTime === p.value
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'bg-muted/40 border-border hover:border-primary/40 hover:text-primary',
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                    {presets.generic.map((p) => (
                      <button
                        key={`g-${p.value}`}
                        type="button"
                        onClick={() => setValidUntilTime(p.value)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-mono tabular-nums border transition-colors',
                          validUntilTime === p.value
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'bg-muted/40 border-border hover:border-primary/40 hover:text-primary',
                        )}
                      >
                        {p.value}
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    A lista ficará válida na data do evento até este horário
                  </p>
                </div>

                {/* Limite */}
                <div className="space-y-2">
                  <Label htmlFor="maxGuests" className="text-sm font-medium">
                    Limite de convidados <span className="text-muted-foreground font-normal">(opcional)</span>
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
                  <p className={cn(
                    'text-xs',
                    limitNum ? 'text-emerald-500' : 'text-muted-foreground',
                  )}>
                    {limitNum
                      ? `Máximo de ${limitNum} convidados nesta lista`
                      : 'Deixe em branco para ilimitado'}
                  </p>
                </div>
              </section>

              {/* Seção 3 — Compartilhamento */}
              <section className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Compartilhamento
                </Label>
                <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <LinkIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-xs leading-relaxed">
                    <div className="font-medium text-foreground">Link público gerado automaticamente</div>
                    <div className="text-muted-foreground">
                      Você poderá copiar e compartilhar após criar a lista
                    </div>
                  </div>
                </div>
              </section>

              {/* Resumo */}
              <div className="rounded-lg bg-card border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Resumo
                </div>
                {nameTrim ? (
                  <div className="text-sm flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="font-semibold truncate max-w-[180px]">{nameTrim}</span>
                    <span className="text-muted-foreground">·</span>
                    {timeValid ? (
                      <span className="text-muted-foreground">
                        válida até <span className="font-mono text-foreground">{validUntilTime}</span>
                      </span>
                    ) : (
                      <Badge variant="destructive" className="h-5 gap-1 px-1.5">
                        <AlertCircle className="h-3 w-3" /> horário inválido
                      </Badge>
                    )}
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {limitNum ? `até ${limitNum} convidados` : 'sem limite'}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    Preencha o nome da lista
                  </div>
                )}
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
                {isSubmitting ? 'Criando...' : 'Criar lista'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
