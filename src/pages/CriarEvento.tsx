import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, Edit2, Flame, Users, Clock } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { useEvents } from '@/hooks/useEvents';
import { cn } from '@/lib/utils';

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const steps = [
  { id: 1, title: 'Básico' },
  { id: 2, title: 'Data e Local' },
  { id: 3, title: 'Ingressos' },
  { id: 4, title: 'Revisão' },
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

// Generate all 15-min time slots
const allTimeOptions: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    allTimeOptions.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

export default function CriarEvento() {
  const navigate = useNavigate();
  const { createEvent } = useEvents();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();

  // Step 2 state
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');

  // Step 3 state
  const [lots, setLots] = useState<InlineLot[]>([createEmptyLot(0)]);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState('');

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Filter end time options when same day
  const filteredEndTimeOptions = useMemo(() => {
    if (!startDate || !endDate) return allTimeOptions;
    const sameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');
    if (!sameDay || !startTime) return allTimeOptions;
    return allTimeOptions.filter((t) => t > startTime);
  }, [startDate, endDate, startTime]);

  // Calculate event duration
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
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const updateLot = (id: string, updates: Partial<InlineLot>) => {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const removeLot = (id: string) => {
    setLots((prev) => prev.filter((l) => l.id !== id));
  };

  const addLot = () => {
    setLots((prev) => [...prev, createEmptyLot(prev.length)]);
  };

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
        },
        {
          onSuccess: (data) => resolve(data),
          onError: (err) => reject(err),
        }
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

    navigate('/produtor/eventos');
  };

  return (
    <ProducerLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/produtor/dashboard' },
        { label: 'Meus Eventos', href: '/produtor/eventos' },
        { label: 'Criar Evento' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        {/* Compact Header + Stepper */}
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/produtor/eventos')} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold whitespace-nowrap">Criar Novo Evento</h1>
          <div className="flex items-center gap-1 ml-auto">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                    currentStep >= step.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {currentStep > step.id ? <Check className="w-3 h-3" /> : step.id}
                </div>
                <span className={cn('text-xs ml-1 hidden lg:inline', currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground')}>
                  {step.title}
                </span>
                {index < steps.length - 1 && (
                  <div className={cn('h-0.5 w-6 mx-1 transition-colors', currentStep > step.id ? 'bg-primary' : 'bg-muted')} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Basic Info - Compact */}
        {currentStep === 1 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1fr,200px]">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Título do Evento *</Label>
                    <Input placeholder="Ex: Show de Rock na Praça" value={title} onChange={(e) => setTitle(e.target.value)} />
                    {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Textarea placeholder="Descreva todos os detalhes do seu evento..." rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Imagem</Label>
                  <ImageUpload value={imageUrl} onChange={setImageUrl} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Date and Location - Compact 2-col layout */}
        {currentStep === 2 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Data de Início *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-9 text-sm', !startDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {startDate ? format(startDate, 'dd/MM/yyyy') : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Horário de Início *</Label>
                  <TimeSelect value={startTime} onChange={setStartTime} placeholder="Selecione" />
                  {errors.startTime && <p className="text-xs text-destructive">{errors.startTime}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Data de Fim *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-9 text-sm', !endDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {endDate ? format(endDate, 'dd/MM/yyyy') : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); if (d && startDate && format(d, 'yyyy-MM-dd') === format(startDate, 'yyyy-MM-dd') && endTime && endTime <= startTime) setEndTime(''); }} disabled={(date) => startDate ? date < startDate : date < new Date(new Date().setHours(0,0,0,0))} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Horário de Fim *</Label>
                  <TimeSelect value={endTime} onChange={setEndTime} placeholder="Selecione" options={filteredEndTimeOptions} />
                  {errors.endTime && <p className="text-xs text-destructive">{errors.endTime}</p>}
                </div>
              </div>

              {eventDuration && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md w-fit">
                  <Clock className="w-3.5 h-3.5" />
                  Duração: <span className="font-medium text-foreground">{eventDuration}</span>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label>Local / Estabelecimento *</Label>
                  <Input placeholder="Ex: Arena Show" value={venue} onChange={(e) => setVenue(e.target.value)} className="h-9" />
                  {errors.venue && <p className="text-xs text-destructive">{errors.venue}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade *</Label>
                  <Input placeholder="Ex: São Paulo" value={city} onChange={(e) => setCity(e.target.value)} className="h-9" />
                  {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Estado *</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="h-9">
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

              <div className="space-y-1.5">
                <Label>Endereço Completo</Label>
                <Input placeholder="Rua, número, bairro..." value={address} onChange={(e) => setAddress(e.target.value)} className="h-9" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Tickets - Compact */}
        {currentStep === 3 && (
          <div className="space-y-3">
            {lots.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-6">
                  <p className="text-muted-foreground mb-3 text-sm">Nenhum ingresso criado. Você pode criar o evento sem ingressos e adicioná-los depois.</p>
                </CardContent>
              </Card>
            )}

            {lots.map((lot, index) => (
              <Card key={lot.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Sector Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editingSectorId === lot.id ? (
                        <Input
                          value={editingSectorName}
                          onChange={(e) => setEditingSectorName(e.target.value)}
                          onBlur={() => {
                            updateLot(lot.id, { sector_name: editingSectorName || 'Ingressos' });
                            setEditingSectorId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateLot(lot.id, { sector_name: editingSectorName || 'Ingressos' });
                              setEditingSectorId(null);
                            }
                          }}
                          className="h-7 w-44 text-sm"
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Setor:</span>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors bg-muted px-2.5 py-1 rounded-md"
                            onClick={() => {
                              setEditingSectorId(lot.id);
                              setEditingSectorName(lot.sector_name);
                            }}
                          >
                            {lot.sector_name}
                            <Edit2 className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>
                    {lots.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLot(lot.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Name, Description, Price, Quantity in grid */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do Ingresso *</Label>
                      <Input value={lot.name} onChange={(e) => updateLot(lot.id, { name: e.target.value })} placeholder="Ex: 1º Lote" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição (opcional)</Label>
                      <Input value={lot.description} onChange={(e) => updateLot(lot.id, { description: e.target.value })} placeholder="Descrição" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Preço (R$) *</Label>
                      <Input type="number" step="0.01" min="0" value={lot.price} onChange={(e) => updateLot(lot.id, { price: parseFloat(e.target.value) || 0 })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quantidade *</Label>
                      <Input type="number" min="1" value={lot.total_quantity} onChange={(e) => updateLot(lot.id, { total_quantity: parseInt(e.target.value) || 1 })} className="h-8 text-sm" />
                    </div>
                  </div>

                  {/* Sales Period - Toggle Buttons */}
                  <div className="space-y-2">
                    <Label className="text-xs">Período de Vendas</Label>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={lot.sales_start_type === 'now' ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => updateLot(lot.id, { sales_start_type: 'now' })}
                      >
                        Publicar agora
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={lot.sales_start_type === 'scheduled' ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => updateLot(lot.id, { sales_start_type: 'scheduled' })}
                      >
                        Agendar início
                      </Button>
                      {index > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant={lot.sales_start_type === 'after_lot' ? 'default' : 'outline'}
                          className="h-7 text-xs"
                          onClick={() => updateLot(lot.id, { sales_start_type: 'after_lot' })}
                        >
                          Após encerrar ingresso
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Scheduled date picker */}
                  {lot.sales_start_type === 'scheduled' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Data de início das vendas</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-8 text-sm', !lot.start_date && 'text-muted-foreground')}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {lot.start_date ? format(new Date(lot.start_date), 'dd/MM/yyyy') : 'Selecione'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={lot.start_date ? new Date(lot.start_date) : undefined} onSelect={(d) => updateLot(lot.id, { start_date: d ? format(d, 'yyyy-MM-dd') : undefined })} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Horário</Label>
                        <TimeSelect value={lot.start_time || ''} onChange={(v) => updateLot(lot.id, { start_time: v })} placeholder="Horário" />
                      </div>
                    </div>
                  )}

                  {/* After lot - cards */}
                  {lot.sales_start_type === 'after_lot' && index > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Iniciar após encerrar:</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {lots.filter((l) => l.id !== lot.id).map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => updateLot(lot.id, { starts_after_lot_id: l.id })}
                            className={cn(
                              'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                              lot.starts_after_lot_id === l.id
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted text-foreground border-border hover:border-primary'
                            )}
                          >
                            {l.sector_name} — {l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* End date (optional) */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Data de fim de vendas (opcional)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-8 text-sm', !lot.end_date && 'text-muted-foreground')}>
                            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                            {lot.end_date ? format(new Date(lot.end_date), 'dd/MM/yyyy') : 'Selecione (opcional)'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={lot.end_date ? new Date(lot.end_date) : undefined} onSelect={(d) => updateLot(lot.id, { end_date: d ? format(d, 'yyyy-MM-dd') : undefined })} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Horário de fim (opcional)</Label>
                      <TimeSelect value={lot.end_time || ''} onChange={(v) => updateLot(lot.id, { end_time: v })} placeholder="Horário" />
                    </div>
                  </div>

                  {/* Group Ticket + Scarcity in a row */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Group Ticket */}
                    <div className="space-y-2 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <Label className="text-xs font-medium">Ingresso em Grupo</Label>
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
                                'w-8 h-7 rounded text-xs font-medium border transition-colors',
                                lot.group_ticket_quantity === n
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border hover:border-primary'
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fake Scarcity */}
                    <div className="space-y-2 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-orange-500" />
                          <Label className="text-xs font-medium">Escassez Fictícia</Label>
                        </div>
                        <Switch checked={lot.fake_scarcity_enabled} onCheckedChange={(v) => updateLot(lot.id, { fake_scarcity_enabled: v })} />
                      </div>
                      {lot.fake_scarcity_enabled && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <Flame className="w-3 h-3 text-orange-500" />
                            <span className="font-medium">{lot.fake_scarcity_percentage}% vendido</span>
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
                </CardContent>
              </Card>
            ))}

            <Button type="button" variant="outline" className="w-full h-9 text-sm" onClick={addLot}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Ingresso
            </Button>
          </div>
        )}

        {/* Step 4: Review - Compact grid */}
        {currentStep === 4 && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[160px,1fr]">
                {imageUrl && (
                  <img src={imageUrl} alt="Preview" className="w-40 h-28 object-cover rounded-lg" />
                )}
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Título</p>
                    <p className="text-sm font-medium">{title || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Início</p>
                    <p className="text-sm font-medium">
                      {startDate ? format(startDate, 'dd/MM/yyyy') : '-'} às {startTime || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fim</p>
                    <p className="text-sm font-medium">
                      {endDate ? format(endDate, 'dd/MM/yyyy') : '-'} às {endTime || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Local</p>
                    <p className="text-sm font-medium">{venue || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cidade</p>
                    <p className="text-sm font-medium">{city || '-'} - {state || '-'}</p>
                  </div>
                  {eventDuration && (
                    <div>
                      <p className="text-xs text-muted-foreground">Duração</p>
                      <p className="text-sm font-medium">{eventDuration}</p>
                    </div>
                  )}
                </div>
              </div>

              {description && (
                <div>
                  <p className="text-xs text-muted-foreground">Descrição</p>
                  <p className="text-sm whitespace-pre-wrap line-clamp-3">{description}</p>
                </div>
              )}

              {lots.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Ingressos ({lots.length})</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {lots.map((lot) => (
                      <div key={lot.id} className="flex items-center justify-between p-2.5 bg-muted rounded-md text-sm">
                        <div>
                          <p className="font-medium">{lot.sector_name} — {lot.name}</p>
                          <p className="text-xs text-muted-foreground">{lot.total_quantity} ingressos</p>
                        </div>
                        <p className="font-bold text-sm">{formatCurrency(lot.price)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Nenhum ingresso criado. Você poderá adicioná-los depois.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons - tight */}
        <div className="flex justify-between mt-4">
          <Button type="button" variant="outline" size="sm" onClick={prevStep} disabled={currentStep === 1}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>

          {currentStep < 4 ? (
            <Button type="button" size="sm" onClick={nextStep}>
              Próximo
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleSubmit('draft')} disabled={createEvent.isPending}>
                Salvar Rascunho
              </Button>
              <Button type="button" size="sm" onClick={() => handleSubmit('published')} disabled={createEvent.isPending}>
                {createEvent.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Publicando...
                  </>
                ) : (
                  'Publicar Evento'
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </ProducerLayout>
  );
}
