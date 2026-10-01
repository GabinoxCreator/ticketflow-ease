import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUpload } from '@/components/producer/ImageUpload';
import { useProducerProducts, type ProdutoFormData } from '@/hooks/useProducerProducts';
import {
  GRADE_CAMISETA,
  NOME_DO_TIPO,
  lerValor,
  nomeDoProduto,
  ordenarVariantes,
  reais,
  type ProdutoDoCatalogoComGrade,
  type TipoDeProduto,
} from '@/lib/loja/tipos';
import { ShoppingBag, Shirt, CupSoda, Package, Plus, Pencil, Tag, Ruler, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONE_DO_TIPO: Record<TipoDeProduto, typeof Shirt> = {
  camiseta: Shirt,
  copo: CupSoda,
  outro: Package,
};

const EMPTY_FORM: ProdutoFormData = {
  kind: 'camiseta',
  name: '',
  color: '',
  description: '',
  base_price: '',
  image_url: undefined,
  is_active: true,
  variacoes: [...GRADE_CAMISETA],
};

const mesmoRotulo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function ProducerProducts() {
  const { produtos, isLoading, salvarProduto, alternarAtivo } = useProducerProducts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProdutoFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [novaVariacao, setNovaVariacao] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setNovaVariacao('');
    setDialogOpen(true);
  };

  const openEdit = (p: ProdutoDoCatalogoComGrade) => {
    setEditingId(p.id);
    setFormData({
      kind: p.kind,
      name: p.name,
      color: p.color || '',
      description: p.description || '',
      base_price: p.base_price != null ? String(p.base_price).replace('.', ',') : '',
      image_url: p.image_url || undefined,
      is_active: p.is_active,
      variacoes: ordenarVariantes(p.variants).filter((v) => v.is_active).map((v) => v.label),
    });
    setFormErrors({});
    setNovaVariacao('');
    setDialogOpen(true);
  };

  const trocarTipo = (kind: TipoDeProduto) => {
    setFormData((d) => ({
      ...d,
      kind,
      // Camiseta nova já nasce com a grade padrão marcada; quem está editando
      // e já mexeu na grade não perde o que fez.
      variacoes: kind === 'camiseta' && d.variacoes.length === 0 ? [...GRADE_CAMISETA] : d.variacoes,
    }));
  };

  const alternarTamanho = (rotulo: string) => {
    setFormData((d) => {
      const tem = d.variacoes.some((v) => mesmoRotulo(v, rotulo));
      const lista = tem ? d.variacoes.filter((v) => !mesmoRotulo(v, rotulo)) : [...d.variacoes, rotulo];
      // Mantém a grade padrão na ordem de sempre e o que o produtor inventou no fim.
      const padrao = GRADE_CAMISETA.filter((g) => lista.some((v) => mesmoRotulo(v, g)));
      const extras = lista.filter((v) => !GRADE_CAMISETA.some((g) => mesmoRotulo(v, g)));
      return { ...d, variacoes: [...padrao, ...extras] };
    });
  };

  const adicionarVariacao = () => {
    const rotulo = novaVariacao.trim();
    if (!rotulo) return;
    if (formData.variacoes.some((v) => mesmoRotulo(v, rotulo))) {
      setFormErrors((e) => ({ ...e, variacoes: 'Essa variação já está na lista' }));
      return;
    }
    setFormData((d) => ({ ...d, variacoes: [...d.variacoes, rotulo] }));
    setFormErrors((e) => ({ ...e, variacoes: '' }));
    setNovaVariacao('');
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Nome é obrigatório';
    else if (formData.name.trim().length > 100) errs.name = 'Máximo 100 caracteres';
    if (formData.description.trim().length > 500) errs.description = 'Máximo 500 caracteres';
    if (formData.base_price.trim()) {
      const preco = lerValor(formData.base_price);
      if (preco == null) errs.base_price = 'Informe um valor, por exemplo 67,00';
      else if (preco < 0) errs.base_price = 'O preço não pode ser negativo';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await salvarProduto.mutateAsync({ id: editingId, data: formData });
      setDialogOpen(false);
    } catch {
      // O aviso de erro já saiu no hook; a janela fica aberta para corrigir.
    }
  };

  const extras = formData.variacoes.filter((v) => !GRADE_CAMISETA.some((g) => mesmoRotulo(v, g)));

  return (
    <ProducerLayout>
      <Helmet>
        <title>Produtos | FestPag</title>
      </Helmet>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-background to-pink-500/10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-lg shrink-0">
                <ShoppingBag className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Produtos</h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Cadastre camisetas, copos e outros produtos uma vez e venda em qualquer evento
                </p>
              </div>
            </div>
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        ) : produtos && produtos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {produtos.map((p) => {
              const Icone = ICONE_DO_TIPO[p.kind] ?? Package;
              const grade = ordenarVariantes(p.variants).filter((v) => v.is_active);
              return (
                <Card
                  key={p.id}
                  className={cn(
                    'rounded-2xl border-border/60 overflow-hidden transition-all duration-200',
                    !p.is_active && 'opacity-60'
                  )}
                >
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={nomeDoProduto(p)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <Icone className="h-10 w-10 mx-auto mb-1" />
                        <p className="text-xs">Sem foto</p>
                      </div>
                    )}
                  </div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold truncate">{nomeDoProduto(p)}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">{NOME_DO_TIPO[p.kind] ?? p.kind}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {p.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {p.base_price != null && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Tag className="h-3 w-3" />
                          {reais(p.base_price)}
                        </Badge>
                      )}
                      {grade.length > 0 && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Ruler className="h-3 w-3" />
                          {grade.map((v) => v.label).join(', ')}
                        </Badge>
                      )}
                      {!p.image_url && (
                        <Badge variant="outline" className="text-xs">Falta a foto</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">
                        {p.is_active ? 'Ativo' : 'Desativado'}
                      </span>
                      <Switch
                        checked={p.is_active}
                        disabled={alternarAtivo.isPending}
                        onCheckedChange={(v) => alternarAtivo.mutate({ id: p.id, is_active: v })}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-12 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Nenhum produto cadastrado</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Cadastre aqui a camiseta ou o copo do seu evento. Depois, no painel de cada evento, você escolhe o preço, a quantidade e coloca à venda junto com os ingressos.
                </p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Criar primeiro produto
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
            <DialogDescription>
              O preço e a quantidade de cada evento são definidos no painel do evento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Kind */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formData.kind} onValueChange={(v: TipoDeProduto) => trocarTipo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(NOME_DO_TIPO) as TipoDeProduto[]).map((k) => {
                    const Icone = ICONE_DO_TIPO[k];
                    return (
                      <SelectItem key={k} value={k}>
                        <div className="flex items-center gap-2">
                          <Icone className="h-4 w-4" />
                          {NOME_DO_TIPO[k]}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Name + Color */}
            <div className={cn('grid gap-4', formData.kind === 'camiseta' && 'sm:grid-cols-2')}>
              <div className="space-y-2">
                <Label htmlFor="pp-name">Nome *</Label>
                <Input
                  id="pp-name"
                  value={formData.name}
                  onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  placeholder={formData.kind === 'copo' ? 'Ex: Copo do evento' : 'Ex: Camiseta'}
                  className={cn(formErrors.name && 'border-destructive')}
                />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>
              {formData.kind === 'camiseta' && (
                <div className="space-y-2">
                  <Label htmlFor="pp-color">Cor</Label>
                  <Input
                    id="pp-color"
                    value={formData.color}
                    onChange={(e) => setFormData((d) => ({ ...d, color: e.target.value }))}
                    placeholder="Ex: branca"
                  />
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="pp-description">Descrição</Label>
              <Textarea
                id="pp-description"
                value={formData.description}
                onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
                placeholder="O que o comprador precisa saber: tecido, tamanho do copo, etc."
                rows={2}
                className={cn(formErrors.description && 'border-destructive')}
              />
              {formErrors.description && <p className="text-xs text-destructive">{formErrors.description}</p>}
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="pp-price">Preço sugerido (R$)</Label>
              <Input
                id="pp-price"
                inputMode="decimal"
                value={formData.base_price}
                onChange={(e) => setFormData((d) => ({ ...d, base_price: e.target.value }))}
                placeholder="0,00"
                className={cn(formErrors.base_price && 'border-destructive')}
              />
              {formErrors.base_price ? (
                <p className="text-xs text-destructive">{formErrors.base_price}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  É só uma sugestão: o preço que vale é o que você define em cada evento.
                </p>
              )}
            </div>

            {/* Grade */}
            {formData.kind !== 'copo' && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/50">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  {formData.kind === 'camiseta' ? 'Tamanhos' : 'Variações (opcional)'}
                </p>

                {formData.kind === 'camiseta' && (
                  <div className="flex flex-wrap gap-2">
                    {GRADE_CAMISETA.map((g) => {
                      const marcado = formData.variacoes.some((v) => mesmoRotulo(v, g));
                      return (
                        <Button
                          key={g}
                          type="button"
                          size="sm"
                          variant={marcado ? 'default' : 'outline'}
                          className="min-w-12"
                          onClick={() => alternarTamanho(g)}
                        >
                          {g}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {(formData.kind === 'camiseta' ? extras : formData.variacoes).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(formData.kind === 'camiseta' ? extras : formData.variacoes).map((v) => (
                      <Badge key={v} variant="secondary" className="text-sm gap-1 pr-1">
                        {v}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-background/60"
                          onClick={() =>
                            setFormData((d) => ({ ...d, variacoes: d.variacoes.filter((x) => x !== v) }))
                          }
                          aria-label={`Tirar ${v}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={novaVariacao}
                    onChange={(e) => setNovaVariacao(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        adicionarVariacao();
                      }
                    }}
                    placeholder={formData.kind === 'camiseta' ? 'Outro tamanho, ex: XGG ou Infantil 8' : 'Ex: Azul, 500 ml'}
                    maxLength={40}
                  />
                  <Button type="button" variant="outline" onClick={adicionarVariacao}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
                {formErrors.variacoes && <p className="text-xs text-destructive">{formErrors.variacoes}</p>}
                <p className="text-xs text-muted-foreground">
                  {formData.kind === 'camiseta'
                    ? 'O comprador escolhe um desses tamanhos. A quantidade de cada um é definida no evento.'
                    : 'Deixe vazio se o produto não tem variação.'}
                </p>
              </div>
            )}

            {/* Photo */}
            <div className="space-y-2">
              <Label>Foto</Label>
              <ImageUpload
                value={formData.image_url}
                onChange={(url) => setFormData((d) => ({ ...d, image_url: url }))}
              />
              <p className="text-xs text-muted-foreground">
                Sem foto o produto não pode ser colocado à venda.
              </p>
            </div>

            {/* Active switch */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
              <div>
                <Label className="text-sm font-medium">Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Produto desativado não aparece para ser adicionado a novos eventos
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData((d) => ({ ...d, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={salvarProduto.isPending}>
              {salvarProduto.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar produto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProducerLayout>
  );
}
