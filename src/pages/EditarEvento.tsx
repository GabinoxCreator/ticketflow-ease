import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ArrowLeft, Loader2, Save, Eye, Trash2 } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { ImageUpload } from '@/components/producer/ImageUpload';
import { LotManager } from '@/components/producer/LotManager';
import { TimeSelect } from '@/components/producer/TimeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useEvent, useEvents } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const eventSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres').max(150, 'O título deve ter no máximo 150 caracteres'),
  description: z.string().optional(),
  date: z.date({ required_error: 'Selecione uma data' }),
  time: z.string().min(1, 'Informe o horário'),
  end_date: z.date().optional().nullable(),
  end_time: z.string().optional(),
  venue: z.string().min(2, 'Informe o local'),
  city: z.string().min(2, 'Informe a cidade'),
  state: z.string().min(2, 'Selecione o estado'),
  address: z.string().optional(),
  is_hot: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'cancelled', 'finished']).default('draft'),
});

type EventFormData = z.infer<typeof eventSchema>;

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const statusOptions = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'published', label: 'Publicado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'finished', label: 'Finalizado' },
];

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  description: 'Descrição',
  date: 'Data de início',
  time: 'Horário de início',
  end_date: 'Data de término',
  end_time: 'Horário de término',
  venue: 'Local',
  city: 'Cidade',
  state: 'Estado',
  address: 'Endereço',
  is_hot: 'Destaque',
  status: 'Status',
};

export default function EditarEvento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: event, isLoading: isLoadingEvent } = useEvent(id);
  const { updateEvent, deleteEvent } = useEvents();
  const { lots, createLot, updateLot, deleteLot, isLoading: isLoadingLots } = useEventLots(id);
  
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      description: '',
      time: '',
      end_time: '',
      venue: '',
      city: '',
      state: '',
      address: '',
      is_hot: false,
      status: 'draft',
    },
  });

  const { register, handleSubmit, formState: { errors, isDirty }, watch, setValue, reset } = form;
  const watchedValues = watch();

  useEffect(() => {
    if (event) {
      reset({
        title: event.title,
        description: event.description || '',
        date: parseISO(event.date),
        time: (event.time || '').slice(0, 5),
        end_date: event.end_date ? parseISO(event.end_date) : null,
        end_time: (event.end_time || '').slice(0, 5),
        venue: event.venue,
        city: event.city,
        state: event.state,
        address: event.address || '',
        is_hot: event.is_hot,
        status: event.status,
      });
      setImageUrl(event.image_url || undefined);
    }
  }, [event, reset]);

  const onSubmit = async (data: EventFormData) => {
    if (!id) return;

    const eventData: any = {
      title: data.title,
      description: data.description,
      date: format(data.date, 'yyyy-MM-dd'),
      time: data.time,
      end_date: data.end_date ? format(data.end_date, 'yyyy-MM-dd') : null,
      end_time: data.end_time || null,
      venue: data.venue,
      city: data.city,
      state: data.state,
      address: data.address,
      image_url: imageUrl,
      is_hot: data.is_hot,
      status: data.status,
    };

    updateEvent.mutate(
      { id, data: eventData },
      { onSuccess: () => reset(data) }
    );
  };

  const handleDelete = () => {
    if (!id) return;
    deleteEvent.mutate(id, {
      onSuccess: () => navigate('/produtor/eventos'),
    });
  };

  if (isLoadingEvent) {
    return (
      <ProducerLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </ProducerLayout>
    );
  }

  if (!event) {
    return (
      <ProducerLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Evento não encontrado</h2>
          <Button onClick={() => navigate('/produtor/eventos')}>Voltar para Meus Eventos</Button>
        </div>
      </ProducerLayout>
    );
  }

  return (
    <ProducerLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/produtor/dashboard' },
        { label: 'Meus Eventos', href: '/produtor/eventos' },
        { label: 'Editar Evento' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/produtor/eventos')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{event.title}</h1>
                <Badge
                  variant={event.status === 'published' ? 'default' : event.status === 'cancelled' ? 'destructive' : 'secondary'}
                >
                  {statusOptions.find((s) => s.value === event.status)?.label}
                </Badge>
              </div>
              <p className="text-muted-foreground">Edite as informações do seu evento</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/evento/${id}`)}>
              <Eye className="w-4 h-4 mr-2" />
              Visualizar
            </Button>
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </div>
        </div>

        <Tabs defaultValue="info" className="space-y-6">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="lots">Lotes ({lots?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <form onSubmit={handleSubmit(onSubmit, () => toast.error('Verifique os campos obrigatórios destacados'))} className="space-y-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Informações Básicas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input id="title" {...register('title')} />
                    {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea id="description" rows={5} {...register('description')} />
                  </div>
                </CardContent>
              </Card>

              {/* Date and Location */}
              <Card>
                <CardHeader>
                  <CardTitle>Data e Local</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data de Início *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn('w-full justify-start text-left font-normal', !watchedValues.date && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {watchedValues.date
                              ? format(watchedValues.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                              : 'Selecione'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={watchedValues.date}
                            onSelect={(date) => setValue('date', date as Date, { shouldDirty: true })}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      {errors.date && <p className="text-sm text-destructive">{errors.date.message as string}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Horário de Início *</Label>
                      <TimeSelect
                        value={watchedValues.time || ''}
                        onChange={(v) => setValue('time', v, { shouldDirty: true, shouldValidate: true })}
                      />
                      {errors.time && <p className="text-sm text-destructive">{errors.time.message}</p>}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data de Fim</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn('w-full justify-start text-left font-normal', !watchedValues.end_date && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {watchedValues.end_date
                              ? format(watchedValues.end_date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                              : 'Selecione (opcional)'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={watchedValues.end_date || undefined}
                            onSelect={(date) => setValue('end_date', date || null, { shouldDirty: true })}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Horário de Fim</Label>
                      <TimeSelect
                        value={watchedValues.end_time || ''}
                        onChange={(v) => setValue('end_time', v, { shouldDirty: true })}
                        placeholder="Selecione (opcional)"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="venue">Local / Estabelecimento *</Label>
                    <Input id="venue" {...register('venue')} />
                    {errors.venue && <p className="text-sm text-destructive">{errors.venue.message}</p>}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade *</Label>
                      <Input id="city" {...register('city')} />
                      {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Estado *</Label>
                      <Select
                        value={watchedValues.state || ''}
                        onValueChange={(value) => setValue('state', value, { shouldDirty: true, shouldValidate: true })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.state && <p className="text-sm text-destructive">{errors.state.message}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço Completo</Label>
                    <Input id="address" {...register('address')} />
                  </div>
                </CardContent>
              </Card>

              {/* Image and Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Imagem e Configurações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ImageUpload value={imageUrl} onChange={setImageUrl} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label htmlFor="is_hot" className="font-medium">Destacar 🔥</Label>
                        <p className="text-sm text-muted-foreground">Aparecer em destaque</p>
                      </div>
                      <Switch
                        id="is_hot"
                        checked={watchedValues.is_hot}
                        onCheckedChange={(checked) => setValue('is_hot', checked, { shouldDirty: true })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={watchedValues.status}
                        onValueChange={(value: any) => setValue('status', value, { shouldDirty: true })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((status) => (
                            <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={(!isDirty && imageUrl === event.image_url) || updateEvent.isPending}
                >
                  {updateEvent.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="lots">
            <LotManager
              lots={lots || []}
              onAdd={(data) => createLot.mutate(data)}
              onUpdate={(lotId, data) => updateLot.mutate({ id: lotId, data })}
              onDelete={(lotId) => deleteLot.mutate(lotId)}
              isLoading={isLoadingLots}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O evento "{event.title}" e todos os seus lotes serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProducerLayout>
  );
}
