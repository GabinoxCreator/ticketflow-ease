import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { ImageUpload } from '@/components/producer/ImageUpload';
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
import { useEvents } from '@/hooks/useEvents';
import { cn } from '@/lib/utils';

const eventSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres').max(100),
  short_description: z.string().max(200).optional(),
  description: z.string().optional(),
  date: z.date({ required_error: 'Selecione uma data' }),
  time: z.string().min(1, 'Informe o horário'),
  venue: z.string().min(2, 'Informe o local'),
  city: z.string().min(2, 'Informe a cidade'),
  state: z.string().min(2, 'Selecione o estado'),
  address: z.string().optional(),
  category: z.string().min(1, 'Selecione uma categoria'),
  image_url: z.string().optional(),
  is_hot: z.boolean().default(false),
  status: z.enum(['draft', 'published']).default('draft'),
});

type EventFormData = z.infer<typeof eventSchema>;

const categories = [
  'Festas e Shows',
  'Teatro e Cultura',
  'Esportes',
  'Congressos e Palestras',
  'Gastronomia',
  'Infantil',
  'Cursos e Workshops',
  'Outros',
];

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const steps = [
  { id: 1, title: 'Informações Básicas' },
  { id: 2, title: 'Data e Local' },
  { id: 3, title: 'Imagem' },
  { id: 4, title: 'Revisão' },
];

export default function CriarEvento() {
  const navigate = useNavigate();
  const { createEvent } = useEvents();
  const [currentStep, setCurrentStep] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | undefined>();

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      short_description: '',
      description: '',
      time: '',
      venue: '',
      city: '',
      state: '',
      address: '',
      category: '',
      is_hot: false,
      status: 'draft',
    },
  });

  const { register, handleSubmit, formState: { errors }, watch, setValue, trigger } = form;
  const watchedValues = watch();

  const nextStep = async () => {
    let fieldsToValidate: (keyof EventFormData)[] = [];
    
    if (currentStep === 1) {
      fieldsToValidate = ['title', 'category'];
    } else if (currentStep === 2) {
      fieldsToValidate = ['date', 'time', 'venue', 'city', 'state'];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = async (data: EventFormData) => {
    createEvent.mutate({
      title: data.title,
      description: data.description,
      short_description: data.short_description,
      date: format(data.date, 'yyyy-MM-dd'),
      time: data.time,
      venue: data.venue,
      city: data.city,
      state: data.state,
      address: data.address,
      category: data.category,
      image_url: imageUrl,
      is_hot: data.is_hot,
      status: data.status,
    }, {
      onSuccess: () => {
        navigate('/produtor/eventos');
      },
    });
  };

  const handlePublish = async () => {
    setValue('status', 'published');
    handleSubmit(onSubmit)();
  };

  const handleSaveDraft = async () => {
    setValue('status', 'draft');
    handleSubmit(onSubmit)();
  };

  return (
    <ProducerLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/produtor/dashboard' },
        { label: 'Meus Eventos', href: '/produtor/eventos' },
        { label: 'Criar Evento' },
      ]}
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/produtor/eventos')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-3xl font-bold">Criar Novo Evento</h1>
          <p className="text-muted-foreground">
            Preencha as informações do seu evento
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    currentStep >= step.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {currentStep > step.id ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    step.id
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-1 w-12 sm:w-24 mx-2 transition-colors',
                      currentStep > step.id ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((step) => (
              <span
                key={step.id}
                className={cn(
                  'text-xs sm:text-sm',
                  currentStep >= step.id
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {step.title}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Informações Básicas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Título do Evento *</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Show de Rock na Praça"
                    {...register('title')}
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive">{errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categoria *</Label>
                  <Select
                    value={watchedValues.category}
                    onValueChange={(value) => setValue('category', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && (
                    <p className="text-sm text-destructive">{errors.category.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="short_description">Descrição Curta</Label>
                  <Input
                    id="short_description"
                    placeholder="Uma breve descrição do evento (máx. 200 caracteres)"
                    maxLength={200}
                    {...register('short_description')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição Completa</Label>
                  <Textarea
                    id="description"
                    placeholder="Descreva todos os detalhes do seu evento..."
                    rows={5}
                    {...register('description')}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Date and Location */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Data e Local</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data do Evento *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !watchedValues.date && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {watchedValues.date
                            ? format(watchedValues.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                            : 'Selecione uma data'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={watchedValues.date}
                          onSelect={(date) => setValue('date', date as Date)}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.date && (
                      <p className="text-sm text-destructive">{errors.date.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="time">Horário *</Label>
                    <Input
                      id="time"
                      type="time"
                      {...register('time')}
                    />
                    {errors.time && (
                      <p className="text-sm text-destructive">{errors.time.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="venue">Local / Estabelecimento *</Label>
                  <Input
                    id="venue"
                    placeholder="Ex: Arena Show"
                    {...register('venue')}
                  />
                  {errors.venue && (
                    <p className="text-sm text-destructive">{errors.venue.message}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade *</Label>
                    <Input
                      id="city"
                      placeholder="Ex: São Paulo"
                      {...register('city')}
                    />
                    {errors.city && (
                      <p className="text-sm text-destructive">{errors.city.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">Estado *</Label>
                    <Select
                      value={watchedValues.state}
                      onValueChange={(value) => setValue('state', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.state && (
                      <p className="text-sm text-destructive">{errors.state.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Endereço Completo</Label>
                  <Input
                    id="address"
                    placeholder="Rua, número, bairro..."
                    {...register('address')}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Image */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Imagem do Evento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Adicione uma imagem de capa para o seu evento. Recomendamos imagens
                  com proporção 16:9 e resolução mínima de 1200x675 pixels.
                </p>
                <ImageUpload value={imageUrl} onChange={setImageUrl} />

                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <Label htmlFor="is_hot" className="font-medium">
                      Destacar como "Em Alta" 🔥
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Eventos em alta aparecem com destaque na página inicial
                    </p>
                  </div>
                  <Switch
                    id="is_hot"
                    checked={watchedValues.is_hot}
                    onCheckedChange={(checked) => setValue('is_hot', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Revisão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  {imageUrl && (
                    <div className="sm:col-span-2">
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-muted-foreground">Título</p>
                    <p className="font-medium">{watchedValues.title || '-'}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Categoria</p>
                    <p className="font-medium">{watchedValues.category || '-'}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Data e Horário</p>
                    <p className="font-medium">
                      {watchedValues.date
                        ? format(watchedValues.date, "dd/MM/yyyy", { locale: ptBR })
                        : '-'}{' '}
                      às {watchedValues.time || '-'}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Local</p>
                    <p className="font-medium">
                      {watchedValues.venue || '-'}, {watchedValues.city || '-'} - {watchedValues.state || '-'}
                    </p>
                  </div>

                  {watchedValues.short_description && (
                    <div className="sm:col-span-2">
                      <p className="text-sm text-muted-foreground">Descrição Curta</p>
                      <p className="font-medium">{watchedValues.short_description}</p>
                    </div>
                  )}

                  {watchedValues.description && (
                    <div className="sm:col-span-2">
                      <p className="text-sm text-muted-foreground">Descrição Completa</p>
                      <p className="font-medium whitespace-pre-wrap">{watchedValues.description}</p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">
                    💡 <strong>Dica:</strong> Após criar o evento, você poderá adicionar
                    os lotes de ingressos na página de edição.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Anterior
            </Button>

            {currentStep < 4 ? (
              <Button type="button" onClick={nextStep}>
                Próximo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={createEvent.isPending}
                >
                  Salvar Rascunho
                </Button>
                <Button
                  type="button"
                  onClick={handlePublish}
                  disabled={createEvent.isPending}
                >
                  {createEvent.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    'Publicar Evento'
                  )}
                </Button>
              </div>
            )}
          </div>
        </form>
      </div>
    </ProducerLayout>
  );
}
