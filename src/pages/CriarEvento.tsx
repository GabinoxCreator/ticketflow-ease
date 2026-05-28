import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, Edit2, Flame,
  Users, Clock, MapPin, ImageIcon, Sparkles, CalendarDays, Ticket, Eye, Send, FileText
} from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { ImageUpload } from '@/components/producer/ImageUpload';
import { TimeSelect } from '@/components/producer/TimeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useEvents, type EventType } from '@/hooks/useEvents';
import { useProducerTableMaps } from '@/hooks/useProducerTableMaps';
import { usePublishEvent } from '@/hooks/useEventPublishing';
import { EventTypeSelector } from '@/components/producer/EventTypeSelector';
import { cn } from '@/lib/utils';

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const steps = [
  { id: 1, title: 'Dados do Evento', short: 'Dados' },
  { id: 2, title: 'Data e Local', short: 'Local' },
  { id: 3, title: 'Ingressos', short: 'Ingressos' },
  { id: 4, title: 'Revisão', short: 'Revisão' },
];

interface InlineLot {
  id: string;
  sector_name: string;
  name: string;
  description: string;
  price: number;
  total_quantity: number;
  sales_start_type: 'now' | 'scheduled' | 'after_lot';
  start_date?: string;
  start_time?: string;
  starts_after_lot_id?: string;
  end_date?: string;
  end_time?: string;
  group_ticket_enabled: boolean;
  group_ticket_quantity: number;
  fake_scarcity_enabled: boolean;
  fake_scarcity_percentage: number;
  is_active: boolean;
}

function createEmptyLot(index: number): InlineLot {
  return {
    id: crypto.randomUUID(),
    sector_name: 'Ingressos',
    name: `${index + 1}º Lote`,
    description: '',
    price: 0,
    total_quantity: 100,
    sales_start_type: 'now',
    group_ticket_enabled: false,
    group_ticket_quantity: 2,
    fake_scarcity_enabled: false,
    fake_scarcity_percentage: 50,
    is_active: true,
  };
}

const allTimeOptions: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    allTimeOptions.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

// ====== Reusable premium primitives ======
const inputClass =
  'h-11 rounded-xl bg-background/50 border-border/60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 transition';

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden', className)}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {children}
    </div>
  );
}

function StepHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-[hsl(330,85%,60%)]/20 border border-primary/20 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-primary/20 via-border to-transparent" />
    </div>
  );
}

export default function CriarEvento() {
  const navigate = useNavigate();
  const { createEvent } = useEvents();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [eventType, setEventType] = useState<EventType>('ingresso');

  // Step 2
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');

  // Step 3
  const [lots, setLots] = useState<InlineLot[]>([createEmptyLot(0)]);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredEndTimeOptions = useMemo(() => {
    if (!startDate || !endDate) return allTimeOptions;
    const sameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');
    if (!sameDay || !startTime) return allTimeOptions;
    return allTimeOptions.filter((t) => t > startTime);
  }, [startDate, endDate, startTime]);

  const eventDuration = useMemo(() => {
    if (!startDate || !startTime || !endDate || !endTime) return null;
    const start = new Date(`${format(startDate, 'yyyy-MM-dd')}T${startTime}`);
    const end = new Date(`${format(endDate, 'yyyy-MM-dd')}T${endTime}`);
    if (end <= start) return null;
    const totalMins = differenceInMinutes(end, start);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  }, [startDate, startTime, endDate, endTime]);

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!title || title.length < 3) newErrors.title = 'O título deve ter pelo menos 3 caracteres';
    } else if (step === 2) {
      if (!startDate) newErrors.startDate = 'Selecione a data de início';
      if (!startTime) newErrors.startTime = 'Selecione o horário de início';
      if (!endDate) newErrors.endDate = 'Selecione a data de fim';
      if (!endTime) newErrors.endTime = 'Selecione o horário de fim';
      if (!venue || venue.length < 2) newErrors.venue = 'Informe o local';
      if (!city || city.length < 2) newErrors.city = 'Informe a cidade';
      if (!state) newErrors.state = 'Selecione o estado';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) setCurrentStep((p) => Math.min(p + 1, 4));
  };
  const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

  const updateLot = (id: string, updates: Partial<InlineLot>) =>
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  const removeLot = (id: string) => setLots((prev) => prev.filter((l) => l.id !== id));
  const addLot = () => setLots((prev) => [...prev, createEmptyLot(prev.length)]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!startDate || !endDate) return;
    const eventResult = await new Promise<any>((resolve, reject) => {
      createEvent.mutate(
        {
          title,
          description,
          date: format(startDate, 'yyyy-MM-dd'),
          time: startTime,
          end_date: format(endDate, 'yyyy-MM-dd'),
          end_time: endTime || undefined,
          venue,
          city,
          state,
          address,
          category: 'Outros',
          image_url: imageUrl,
          is_hot: true,
          status,
          event_type: eventType,
        },
        { onSuccess: (data) => resolve(data), onError: (err) => reject(err) }
      );
    });

    if (eventResult?.id && lots.length > 0) {
      const { supabase } = await import('@/integrations/supabase/client');
      for (const lot of lots) {
        await supabase.from('event_lots').insert({
          event_id: eventResult.id,
          name: lot.name,
          description: lot.description || null,
          price: lot.price,
          total_quantity: lot.total_quantity,
          is_active: lot.is_active,
          sector_name: lot.sector_name,
          group_ticket_enabled: lot.group_ticket_enabled,
          group_ticket_quantity: lot.group_ticket_quantity,
          sales_start_type: lot.sales_start_type,
          start_date: lot.start_date || null,
          fake_scarcity_enabled: lot.fake_scarcity_enabled,
          fake_scarcity_percentage: lot.fake_scarcity_percentage,
        });
      }
    }
    navigate(eventResult?.id ? `/produtor/eventos/${eventResult.id}` : '/produtor/eventos');
  };

  const stepMeta = [
    { icon: Sparkles, title: 'Vamos começar pelo básico', subtitle: 'Conte ao seu público o que torna esse evento especial' },
    { icon: CalendarDays, title: 'Quando e onde acontece', subtitle: 'Defina datas, horários e endereço completo' },
    { icon: Ticket, title: 'Configure os ingressos', subtitle: 'Crie lotes, defina preços e regras de venda' },
    { icon: Eye, title: 'Pré-visualização final', subtitle: 'Revise como seu evento vai aparecer para o público' },
  ];

  return (
    <ProducerLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/produtor/dashboard' },
        { label: 'Meus Eventos', href: '/produtor/eventos' },
        { label: 'Criar Evento' },
      ]}
    >
      <div className="max-w-5xl mx-auto px-2 md:px-0 pb-8">
        {/* HEADER */}
        <div className="flex items-start gap-3 mb-5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/produtor/eventos')}
            className="shrink-0 mt-0.5 h-10 w-10 rounded-xl bg-card/50 border border-primary/10 backdrop-blur-xl hover:bg-card/80"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-[hsl(250,85%,70%)] to-[hsl(330,85%,65%)] bg-clip-text text-transparent">
              Criar Novo Evento
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure seu evento em 4 passos rápidos</p>
          </div>
        </div>

        {/* STEPPER */}
        <GlassCard className="mb-5">
          <div className="p-4 md:p-5">
            <div className="flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-none">
              {steps.map((step, index) => {
                const isActive = currentStep === step.id;
                const isDone = currentStep > step.id;
                return (
                  <div key={step.id} className="flex items-center gap-2 md:gap-3 shrink-0 flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-all',
                          isActive && 'bg-gradient-to-br from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white shadow-[0_0_20px_-4px_hsl(var(--primary)/0.6)]',
                          isDone && 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                          !isActive && !isDone && 'bg-muted/40 text-muted-foreground border border-border'
                        )}
                      >
                        {isDone ? <Check className="w-4 h-4" /> : step.id}
                      </div>
                      <span
                        className={cn(
                          'text-xs font-medium whitespace-nowrap transition-colors',
                          isActive ? 'text-foreground' : isDone ? 'text-emerald-400/80' : 'text-muted-foreground',
                          'hidden md:inline'
                        )}
                      >
                        {step.title}
                      </span>
                      <span className={cn('text-xs font-medium md:hidden', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                        {isActive ? step.short : ''}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden min-w-[20px]">
                        <div
                          className={cn(
                            'h-full transition-all duration-500',
                            isDone ? 'w-full bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)]' : 'w-0'
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </GlassCard>

        {/* STEP 1 */}
        {currentStep === 1 && (
          <GlassCard>
            <div className="p-6 md:p-8">
              <StepHeader icon={stepMeta[0].icon} title={stepMeta[0].title} subtitle={stepMeta[0].subtitle} />

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Título do Evento *</Label>
                  <Input
                    placeholder="Ex: Show de Rock na Praça"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inputClass}
                  />
                  {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Descrição</Label>
                  <div className="relative">
                    <Textarea
                      placeholder="Descreva todos os detalhes do seu evento, atrações, regras..."
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="rounded-xl bg-background/50 border-border/60 focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                    />
                    <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/70">
                      {description.length} caracteres
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Imagem do Evento</Label>
                  <ImageUpload value={imageUrl} onChange={setImageUrl} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tipo de venda *</Label>
                  <EventTypeSelector value={eventType} onChange={setEventType} />
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* STEP 2 */}
        {currentStep === 2 && (
          <GlassCard>
            <div className="p-6 md:p-8">
              <StepHeader icon={stepMeta[1].icon} title={stepMeta[1].title} subtitle={stepMeta[1].subtitle} />

              <SectionLabel>Início *</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Data de Início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal h-11 rounded-xl bg-background/50 border-border/60 hover:bg-background/80 hover:border-primary/30',
                          !startDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {startDate ? <span className="font-medium text-foreground">{format(startDate, 'dd/MM/yyyy')}</span> : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Horário de Início</Label>
                  <TimeSelect value={startTime} onChange={setStartTime} placeholder="Selecione" />
                  {errors.startTime && <p className="text-xs text-destructive">{errors.startTime}</p>}
                </div>
              </div>

              <SectionLabel>Fim *</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 mb-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Data de Fim</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal h-11 rounded-xl bg-background/50 border-border/60 hover:bg-background/80 hover:border-primary/30',
                          !endDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {endDate ? <span className="font-medium text-foreground">{format(endDate, 'dd/MM/yyyy')}</span> : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(d) => {
                          setEndDate(d);
                          if (d && startDate && format(d, 'yyyy-MM-dd') === format(startDate, 'yyyy-MM-dd') && endTime && endTime <= startTime) setEndTime('');
                        }}
                        disabled={(date) => (startDate ? date < startDate : date < new Date(new Date().setHours(0, 0, 0, 0)))}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Horário de Fim</Label>
                  <TimeSelect value={endTime} onChange={setEndTime} placeholder="Selecione" options={filteredEndTimeOptions} />
                  {errors.endTime && <p className="text-xs text-destructive">{errors.endTime}</p>}
                </div>
              </div>

              {eventDuration && (
                <div className="inline-flex items-center gap-2 text-sm bg-gradient-to-r from-primary/10 to-[hsl(330,85%,60%)]/10 border border-primary/20 px-4 py-2 rounded-xl mb-6">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">Duração:</span>
                  <span className="font-semibold text-foreground">{eventDuration}</span>
                </div>
              )}

              <SectionLabel>Onde</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2 lg:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">Local / Estabelecimento *</Label>
                  <Input placeholder="Ex: Arena Show" value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
                  {errors.venue && <p className="text-xs text-destructive">{errors.venue}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Cidade *</Label>
                  <Input placeholder="Ex: São Paulo" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
                  {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Estado *</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label className="text-xs font-medium text-muted-foreground">Endereço Completo</Label>
                <Input placeholder="Rua, número, bairro..." value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              </div>
            </div>
          </GlassCard>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <GlassCard>
              <div className="p-6 md:p-8 pb-4">
                <StepHeader icon={stepMeta[2].icon} title={stepMeta[2].title} subtitle={stepMeta[2].subtitle} />
              </div>
            </GlassCard>

            {lots.length === 0 && (
              <GlassCard className="border-dashed">
                <div className="flex flex-col items-center justify-center py-8 px-6">
                  <p className="text-muted-foreground text-sm text-center">
                    Nenhum ingresso criado. Você pode criar o evento sem ingressos e adicioná-los depois.
                  </p>
                </div>
              </GlassCard>
            )}

            {lots.map((lot, index) => (
              <div key={lot.id} className="relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden">
                {/* Left gradient bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)]" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

                <div className="p-5 md:p-6 pl-6 md:pl-7 space-y-5">
                  {/* Header */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white">
                        Lote {index + 1}
                      </span>
                      {editingSectorId === lot.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingSectorName}
                            onChange={(e) => setEditingSectorName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateLot(lot.id, { sector_name: editingSectorName || 'Ingressos' });
                                setEditingSectorId(null);
                              }
                            }}
                            className="h-8 w-44 text-sm rounded-lg"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary hover:text-primary/80"
                            onClick={() => {
                              updateLot(lot.id, { sector_name: editingSectorName || 'Ingressos' });
                              setEditingSectorId(null);
                            }}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors bg-muted/40 px-2.5 py-1 rounded-md border border-border/40"
                          onClick={() => {
                            setEditingSectorId(lot.id);
                            setEditingSectorName(lot.sector_name);
                          }}
                        >
                          <span className="text-foreground/70">Setor:</span>
                          <span className="text-foreground font-semibold">{lot.sector_name}</span>
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {lots.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeLot(lot.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Fields grid */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Nome do Ingresso *</Label>
                      <Input value={lot.name} onChange={(e) => updateLot(lot.id, { name: e.target.value })} placeholder="Ex: 1º Lote" className="h-10 rounded-lg bg-background/50 border-border/60" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</Label>
                      <Input value={lot.description} onChange={(e) => updateLot(lot.id, { description: e.target.value })} placeholder="Descrição" className="h-10 rounded-lg bg-background/50 border-border/60" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Preço (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={lot.price === 0 ? '' : lot.price}
                        onChange={(e) => updateLot(lot.id, { price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                        onBlur={(e) => { if (e.target.value === '') updateLot(lot.id, { price: 0 }); }}
                        className="h-10 rounded-lg bg-background/50 border-border/60"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Quantidade *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={lot.total_quantity === 0 ? '' : lot.total_quantity}
                        onChange={(e) => updateLot(lot.id, { total_quantity: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        onBlur={(e) => { if (e.target.value === '' || parseInt(e.target.value) < 1) updateLot(lot.id, { total_quantity: 1 }); }}
                        className="h-10 rounded-lg bg-background/50 border-border/60"
                      />
                    </div>
                  </div>

                  {/* Sales period — segmented */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Período de Vendas</Label>
                    <div className="inline-flex flex-wrap gap-1 p-1 bg-muted/40 rounded-xl border border-border/40">
                      {[
                        { val: 'now', label: 'Publicar agora' },
                        { val: 'scheduled', label: 'Agendar início' },
                        ...(index > 0 ? [{ val: 'after_lot', label: 'Após encerrar ingresso' }] : []),
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => updateLot(lot.id, { sales_start_type: opt.val as any })}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            lot.sales_start_type === opt.val
                              ? 'bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scheduled */}
                  {lot.sales_start_type === 'scheduled' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Data de início das vendas</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-10 rounded-lg bg-background/50 border-border/60', !lot.start_date && 'text-muted-foreground')}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
                              {lot.start_date ? format(new Date(lot.start_date + 'T12:00:00'), 'dd/MM/yyyy') : 'Selecione'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={lot.start_date ? new Date(lot.start_date + 'T12:00:00') : undefined} onSelect={(d) => updateLot(lot.id, { start_date: d ? format(d, 'yyyy-MM-dd') : undefined })} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Horário</Label>
                        <TimeSelect value={lot.start_time || ''} onChange={(v) => updateLot(lot.id, { start_time: v })} placeholder="Horário" />
                      </div>
                    </div>
                  )}

                  {/* After lot */}
                  {lot.sales_start_type === 'after_lot' && index > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Iniciar após encerrar:</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {lots.filter((l) => l.id !== lot.id).map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => updateLot(lot.id, { starts_after_lot_id: l.id })}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                              lot.starts_after_lot_id === l.id
                                ? 'bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white border-transparent'
                                : 'bg-muted/40 text-foreground border-border/40 hover:border-primary/40'
                            )}
                          >
                            {l.sector_name} — {l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* End date */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Data de fim de vendas (opcional)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-10 rounded-lg bg-background/50 border-border/60', !lot.end_date && 'text-muted-foreground')}>
                            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
                            {lot.end_date ? format(new Date(lot.end_date + 'T12:00:00'), 'dd/MM/yyyy') : 'Selecione (opcional)'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={lot.end_date ? new Date(lot.end_date + 'T12:00:00') : undefined} onSelect={(d) => updateLot(lot.id, { end_date: d ? format(d, 'yyyy-MM-dd') : undefined })} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Horário de fim (opcional)</Label>
                      <TimeSelect value={lot.end_time || ''} onChange={(v) => updateLot(lot.id, { end_time: v })} placeholder="Horário" />
                    </div>
                  </div>

                  {/* Group + Scarcity */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Group */}
                    <div className="space-y-3 p-4 bg-background/40 rounded-xl border border-primary/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <Label className="text-xs font-semibold">Ingresso em Grupo</Label>
                        </div>
                        <Switch checked={lot.group_ticket_enabled} onCheckedChange={(v) => updateLot(lot.id, { group_ticket_enabled: v })} />
                      </div>
                      {lot.group_ticket_enabled && (
                        <div className="flex flex-wrap gap-1">
                          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => updateLot(lot.id, { group_ticket_quantity: n })}
                              className={cn(
                                'w-9 h-8 rounded-lg text-xs font-semibold border transition-all',
                                lot.group_ticket_quantity === n
                                  ? 'bg-gradient-to-br from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white border-transparent'
                                  : 'bg-background text-foreground border-border/60 hover:border-primary/40'
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Scarcity */}
                    <div className="space-y-3 p-4 bg-background/40 rounded-xl border border-primary/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/20 flex items-center justify-center">
                            <Flame className="w-3.5 h-3.5 text-orange-400" />
                          </div>
                          <Label className="text-xs font-semibold">Escassez Fictícia</Label>
                        </div>
                        <Switch checked={lot.fake_scarcity_enabled} onCheckedChange={(v) => updateLot(lot.id, { fake_scarcity_enabled: v })} />
                      </div>
                      {lot.fake_scarcity_enabled && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <Flame className="w-3 h-3 text-orange-400" />
                            <span className="font-semibold text-foreground">{lot.fake_scarcity_percentage}% vendido</span>
                          </div>
                          <Slider
                            value={[lot.fake_scarcity_percentage]}
                            onValueChange={([v]) => updateLot(lot.id, { fake_scarcity_percentage: v })}
                            min={10}
                            max={95}
                            step={5}
                            className="h-2"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addLot}
              className="w-full h-12 rounded-2xl border border-dashed border-primary/30 bg-card/20 backdrop-blur-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/60 hover:bg-gradient-to-r hover:from-primary/5 hover:to-[hsl(330,85%,60%)]/5 transition-all flex items-center justify-center gap-2"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-white" />
              </div>
              Adicionar Ingresso
            </button>
          </div>
        )}

        {/* STEP 4 */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <GlassCard>
              <div className="p-6 md:p-8 pb-4">
                <StepHeader icon={stepMeta[3].icon} title={stepMeta[3].title} subtitle={stepMeta[3].subtitle} />
              </div>
            </GlassCard>

            <article className="relative bg-card/40 backdrop-blur-xl rounded-2xl overflow-hidden border border-primary/10 shadow-[0_0_40px_-12px_hsl(var(--primary)/0.3)]">
              {/* Banner */}
              <div className="relative aspect-[16/10] overflow-hidden">
                {imageUrl ? (
                  <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />

                {/* Status chip */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-300">Pronto para publicar</span>
                </div>

                {startDate && (
                  <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm rounded-xl px-3 py-2 border border-primary/20 shadow-lg">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{format(startDate, 'EEE', { locale: ptBR })}</p>
                    <p className="font-bold text-lg leading-tight text-foreground">{format(startDate, 'dd MMM', { locale: ptBR })}</p>
                  </div>
                )}

                <div className="absolute bottom-4 left-28 right-4">
                  <h2 className="font-bold text-2xl text-foreground drop-shadow-lg line-clamp-2">{title || 'Sem título'}</h2>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 md:p-8 space-y-5">
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0 text-primary" />
                    <span className="truncate">{venue || '-'} • {city || '-'}, {state || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock className="w-4 h-4 flex-shrink-0 text-primary" />
                    <span>{startTime || '-'} – {endTime || '-'}</span>
                    {eventDuration && (
                      <span className="text-xs bg-gradient-to-r from-primary/10 to-[hsl(330,85%,60%)]/10 border border-primary/20 px-2 py-0.5 rounded-full ml-1 text-foreground">
                        {eventDuration}
                      </span>
                    )}
                  </div>
                </div>

                {description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{description}</p>
                )}

                {lots.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Ingressos ({lots.length})</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {lots.map((lot) => (
                        <div key={lot.id} className="relative flex items-center justify-between p-4 bg-background/40 rounded-xl border border-primary/10 overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)]" />
                          <div className="pl-2 min-w-0">
                            <p className="font-semibold text-sm truncate">{lot.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{lot.sector_name} • {lot.total_quantity} ing.</p>
                            {lot.group_ticket_enabled && (
                              <p className="text-xs text-muted-foreground">Grupo de {lot.group_ticket_quantity}</p>
                            )}
                          </div>
                          <p className="font-bold text-lg bg-gradient-to-r from-[hsl(250,85%,70%)] to-[hsl(330,85%,65%)] bg-clip-text text-transparent shrink-0 ml-2">
                            {formatCurrency(lot.price)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-muted/40 rounded-xl border border-border/40">
                    <p className="text-sm text-muted-foreground">⚠️ Nenhum ingresso criado. Você poderá adicioná-los depois.</p>
                  </div>
                )}
              </div>
            </article>
          </div>
        )}

        {/* STICKY NAV BAR */}
        <div className="sticky bottom-4 mt-6 z-10">
          <div className="rounded-2xl border border-primary/10 bg-card/80 backdrop-blur-xl p-3 shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.3)] flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="rounded-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Anterior
            </Button>

            <span className="text-xs text-muted-foreground hidden md:block">
              Passo <span className="text-foreground font-semibold">{currentStep}</span> de 4
            </span>

            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={nextStep}
                className="rounded-xl bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white hover:opacity-90 hover:shadow-lg hover:shadow-primary/30"
              >
                Próximo
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSubmit('draft')}
                  disabled={createEvent.isPending}
                  className="rounded-xl"
                >
                  {createEvent.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  <span className="hidden sm:inline">Salvar como rascunho</span>
                  <span className="sm:hidden">Rascunho</span>
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSubmit('published')}
                  disabled={createEvent.isPending}
                  className="rounded-xl bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] text-white hover:opacity-90 hover:shadow-lg hover:shadow-primary/30"
                >
                  {createEvent.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Publicar evento
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProducerLayout>
  );
}
