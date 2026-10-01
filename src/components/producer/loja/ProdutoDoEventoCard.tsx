import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Package, Pause, Play, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { chaveDaLoja, useInvalidarLoja } from '@/hooks/useLojaDoEvento';
import {
  lojaDb,
  disponivel,
  lerValor,
  nomeDoProduto,
  ordenarVariantes,
  NOME_DA_ENTREGA,
  NOME_DA_PENDENCIA,
  NOME_DO_ESTADO,
  type EstadoNaLoja,
  type EstoqueDoProduto,
  type FormaDeEntrega,
  type ModoTaxaProduto,
  type ProdutoNoEventoCompleto,
} from '@/lib/loja/tipos';
import { cn } from '@/lib/utils';

type ModoDeEstoque = 'unico' | 'por_tamanho';

interface FormDoProduto {
  price: string;
  modo_taxa: ModoTaxaProduto;
  fulfillment: FormaDeEntrega | '';
  fulfillment_info: string;
  modo: ModoDeEstoque;
  qtdUnica: string;
  tamanhos: Record<string, { incluido: boolean; qtd: string }>;
}

const CORES_DO_ESTADO: Record<EstadoNaLoja, string> = {
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  draft: 'bg-muted text-muted-foreground border-border',
};

// Tamanhos que entram na tela: os ativos no catálogo e os que, mesmo
// desativados lá, ainda têm estoque valendo neste evento.
function variantesDoEvento(ep: ProdutoNoEventoCompleto) {
  return ordenarVariantes(ep.product?.variants).filter(
    (v) => v.is_active || ep.stock.some((s) => s.variant_id === v.id && s.is_active),
  );
}

function formDoBanco(ep: ProdutoNoEventoCompleto): FormDoProduto {
  const unica = ep.stock.find((s) => s.variant_id == null);
  const modo: ModoDeEstoque = ep.stock.some((s) => s.variant_id != null && s.is_active) ? 'por_tamanho' : 'unico';
  const tamanhos: FormDoProduto['tamanhos'] = {};
  for (const v of variantesDoEvento(ep)) {
    const linha = ep.stock.find((s) => s.variant_id === v.id);
    tamanhos[v.id] = {
      incluido: modo === 'unico' ? true : !!linha?.is_active,
      qtd: linha && linha.is_active ? String(linha.total_quantity) : '',
    };
  }
  return {
    price: ep.price != null ? String(ep.price).replace('.', ',') : '',
    modo_taxa: ep.modo_taxa,
    fulfillment: ep.fulfillment ?? '',
    fulfillment_info: ep.fulfillment_info ?? '',
    modo,
    qtdUnica: unica && unica.is_active ? String(unica.total_quantity) : '',
    tamanhos,
  };
}

const lerQuantidade = (texto: string): number | null => {
  if (!texto.trim()) return 0;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

interface Props {
  eventId: string;
  ep: ProdutoNoEventoCompleto;
}

export function ProdutoDoEventoCard({ eventId, ep }: Props) {
  const invalidar = useInvalidarLoja(eventId);
  const [form, setForm] = useState<FormDoProduto>(() => formDoBanco(ep));
  const [removerAberto, setRemoverAberto] = useState(false);

  const doBanco = useMemo(() => formDoBanco(ep), [ep]);
  // Só o que o produtor edita entra na assinatura: uma venda nova (que muda
  // vendidos e reservados) não pode apagar o que ele está digitando.
  const assinatura = JSON.stringify(doBanco);
  useEffect(() => {
    setForm(JSON.parse(assinatura));
  }, [assinatura]);

  const alterado = JSON.stringify(form) !== assinatura;
  const variantes = variantesDoEvento(ep);
  const temGrade = variantes.length > 0;
  const linhaUnica = ep.stock.find((s) => s.variant_id == null);
  const linhaDoTamanho = (variantId: string) => ep.stock.find((s) => s.variant_id === variantId);
  const temMovimento = (s: EstoqueDoProduto) => s.sold_quantity > 0 || s.reserved_quantity > 0;
  const totalVendido = ep.stock.reduce((n, s) => n + s.sold_quantity, 0);
  const totalReservado = ep.stock.reduce((n, s) => n + s.reserved_quantity, 0);

  // Linhas que o modo atual deixaria para trás e que já têm venda contada.
  const linhasQueFicamParaTras =
    form.modo === 'unico'
      ? ep.stock.filter((s) => s.variant_id != null && s.is_active && temMovimento(s))
      : ep.stock.filter((s) => s.variant_id == null && s.is_active && temMovimento(s));
  const linhasForaDeUso = ep.stock.filter((s) => !s.is_active && temMovimento(s));

  const { data: pendencias, isLoading: pendenciasLoading } = useQuery({
    queryKey: [...chaveDaLoja(eventId), 'pendencias', ep.id],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await lojaDb.rpc('event_product_pendencias', { _event_product_id: ep.id });
      if (error) throw error;
      return data ?? [];
    },
    enabled: ep.status !== 'active',
  });

  // A mesma conta do banco, feita em cima do que está na tela. Serve para não
  // deixar um produto que JÁ está à venda ser salvo incompleto: o banco só
  // confere na hora de ativar, não nas edições seguintes.
  const faltasDoFormulario = (): string[] => {
    const faltas: string[] = [];
    const preco = lerValor(form.price);
    if (preco == null || preco <= 0) faltas.push('preco');
    if (!ep.product?.image_url) faltas.push('foto');
    if (!form.fulfillment) faltas.push('como_entrega');
    if (form.modo === 'unico' || !temGrade) {
      if (!(lerQuantidade(form.qtdUnica) > 0)) faltas.push('estoque');
    } else {
      const incluidos = variantes.filter((v) => form.tamanhos[v.id]?.incluido);
      if (incluidos.length === 0) faltas.push('estoque');
      else if (incluidos.some((v) => !(lerQuantidade(form.tamanhos[v.id].qtd) > 0))) faltas.push('estoque_incompleto');
    }
    return faltas;
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const preco = form.price.trim() ? lerValor(form.price) : null;
      if (form.price.trim() && (preco == null || preco < 0)) {
        throw new Error('Preço inválido. Use um valor como 67,00.');
      }

      const porTamanho = form.modo === 'por_tamanho' && temGrade;
      const conferir = (qtd: number | null, linha: EstoqueDoProduto | undefined, nome: string): number => {
        if (qtd == null) throw new Error(`Quantidade inválida em ${nome}. Use um número inteiro.`);
        const jaSaiu = linha ? linha.sold_quantity + linha.reserved_quantity : 0;
        if (qtd < jaSaiu) {
          throw new Error(`${nome}: a quantidade não pode ser menor que ${jaSaiu}, que é o que já foi vendido ou está reservado.`);
        }
        return qtd;
      };

      const qtdUnica = porTamanho ? 0 : conferir(lerQuantidade(form.qtdUnica), linhaUnica, 'Quantidade');
      const qtdPorTamanho = new Map<string, number>();
      if (porTamanho) {
        for (const v of variantes) {
          if (!form.tamanhos[v.id]?.incluido) continue;
          qtdPorTamanho.set(v.id, conferir(lerQuantidade(form.tamanhos[v.id].qtd), linhaDoTamanho(v.id), `Tamanho ${v.label}`));
        }
      }

      if (ep.status === 'active') {
        const faltas = faltasDoFormulario();
        if (faltas.length > 0) {
          throw new Error(
            'Este produto está à venda. Pause antes de deixar incompleto: ' +
              faltas.map((f) => NOME_DA_PENDENCIA[f] ?? f).join('; ') + '.',
          );
        }
      }

      const { error } = await lojaDb
        .from('event_products')
        .update({
          price: preco,
          modo_taxa: form.modo_taxa,
          fulfillment: form.fulfillment || null,
          fulfillment_info: form.fulfillment_info.trim() || null,
        })
        .eq('id', ep.id);
      if (error) throw error;

      // Estoque. Só toca em total_quantity e is_active: vendidos e reservados
      // são do servidor. Linha que sai do modo é DESATIVADA, nunca apagada
      // (pode ter venda contada e pedido apontando para ela). Primeiro liga as
      // linhas novas, depois desliga as antigas, para o produto que está à
      // venda não ficar um instante sem estoque nenhum.
      const gravar = async (linha: EstoqueDoProduto | undefined, variantId: string | null, total: number) => {
        const r = linha
          ? await lojaDb.from('event_product_stock').update({ total_quantity: total, is_active: true }).eq('id', linha.id)
          : await lojaDb.from('event_product_stock').insert({ event_product_id: ep.id, variant_id: variantId, total_quantity: total });
        if (r.error) throw r.error;
      };
      const desligar = async (ids: string[]) => {
        if (ids.length === 0) return;
        const r = await lojaDb.from('event_product_stock').update({ is_active: false }).in('id', ids);
        if (r.error) throw r.error;
      };

      if (porTamanho) {
        for (const [variantId, total] of qtdPorTamanho) {
          await gravar(linhaDoTamanho(variantId), variantId, total);
        }
        await desligar(
          ep.stock
            .filter((s) => s.is_active && (s.variant_id == null || !qtdPorTamanho.has(s.variant_id)))
            .map((s) => s.id),
        );
      } else {
        if (linhaUnica || form.qtdUnica.trim()) await gravar(linhaUnica, null, qtdUnica);
        await desligar(ep.stock.filter((s) => s.is_active && s.variant_id != null).map((s) => s.id));
      }
    },
    onSuccess: () => {
      invalidar();
      toast.success('Produto salvo!');
    },
    onError: (e: Error) => {
      // Pode ter salvo uma parte: recarrega para a tela mostrar o que valeu.
      invalidar();
      toast.error(e.message);
    },
  });

  const mudarEstado = useMutation({
    mutationFn: async (novo: EstadoNaLoja) => {
      if (novo === 'active') {
        // Confere de novo na hora do clique: a lista da tela pode estar velha.
        const { data, error } = await lojaDb.rpc('event_product_pendencias', { _event_product_id: ep.id });
        if (error) throw error;
        if ((data ?? []).length > 0) {
          throw new Error('Ainda falta: ' + (data as string[]).map((f) => NOME_DA_PENDENCIA[f] ?? f).join('; ') + '.');
        }
      }
      const { error } = await lojaDb.from('event_products').update({ status: novo }).eq('id', ep.id);
      if (error) throw error;
    },
    onSuccess: (_d, novo) => {
      invalidar();
      toast.success(novo === 'active' ? 'Produto à venda!' : 'Produto pausado. Ele saiu da página do evento.');
    },
    onError: (e: Error) => {
      invalidar();
      toast.error(e.message);
    },
  });

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await lojaDb.from('event_products').delete().eq('id', ep.id);
      if (error) {
        // 23503: pedido ou combo aponta para este produto.
        if (error.code === '23503') {
          throw new Error('Este produto já tem pedido ou faz parte de um combo, então não pode ser tirado do evento. Use o botão de pausar.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidar();
      toast.success('Produto tirado do evento.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ocupado = salvar.isPending || mudarEstado.isPending || remover.isPending;
  const faltas = ep.status === 'active' ? [] : pendencias ?? [];
  const podeAtivar = !alterado && !pendenciasLoading && faltas.length === 0;
  const podeRemover = ep.status !== 'active' && totalVendido === 0 && totalReservado === 0;

  const numeros = (s: EstoqueDoProduto | undefined) =>
    s ? `Vendidos ${s.sold_quantity} · Reservados ${s.reserved_quantity} · Disponíveis ${disponivel(s)}` : 'Vendidos 0 · Reservados 0';

  const rotuloDaLinha = (s: EstoqueDoProduto) =>
    s.variant_id == null
      ? 'Quantidade única'
      : `Tamanho ${ep.product?.variants?.find((v) => v.id === s.variant_id)?.label ?? ''}`.trim();

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
          {ep.product?.image_url ? (
            <img src={ep.product.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{ep.product ? nomeDoProduto(ep.product) : 'Produto'}</span>
            <Badge variant="outline" className={cn('text-xs', CORES_DO_ESTADO[ep.status])}>
              {NOME_DO_ESTADO[ep.status] ?? ep.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {totalVendido} vendidos · {totalReservado} reservados
          </p>
        </div>
        {podeRemover && (
          <Button variant="ghost" size="icon" disabled={ocupado} onClick={() => setRemoverAberto(true)} aria-label="Tirar do evento">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>

      {/* Preço e taxa */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`preco-${ep.id}`}>Preço neste evento (R$)</Label>
          <Input
            id={`preco-${ep.id}`}
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-2">
          <Label>Taxa de serviço</Label>
          <Select value={form.modo_taxa} onValueChange={(v: ModoTaxaProduto) => setForm((f) => ({ ...f, modo_taxa: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="herda">Mesma regra do ingresso</SelectItem>
              <SelectItem value="absorve">Sem taxa para o comprador (sai do meu repasse)</SelectItem>
              {/* Só aparece se o produto já estiver assim no banco: a tela não oferece essa opção. */}
              {form.modo_taxa === 'cliente_paga' && (
                <SelectItem value="cliente_paga">O comprador paga a taxa</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Entrega */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Como o comprador recebe</Label>
          <Select
            value={form.fulfillment || undefined}
            onValueChange={(v: FormaDeEntrega) => setForm((f) => ({ ...f, fulfillment: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha uma opção" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(NOME_DA_ENTREGA) as FormaDeEntrega[]).map((k) => (
                <SelectItem key={k} value={k}>{NOME_DA_ENTREGA[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`info-${ep.id}`}>Instruções para o comprador</Label>
          <Textarea
            id={`info-${ep.id}`}
            rows={2}
            value={form.fulfillment_info}
            onChange={(e) => setForm((f) => ({ ...f, fulfillment_info: e.target.value }))}
            placeholder="Ex: Salão da APAE, a partir das 10h"
          />
        </div>
      </div>

      {/* Estoque */}
      <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/50">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Quantidade disponível neste evento
        </p>

        {temGrade && (
          <RadioGroup
            value={form.modo}
            onValueChange={(v: ModoDeEstoque) => setForm((f) => ({ ...f, modo: v }))}
            className="grid gap-2 sm:grid-cols-2"
          >
            <Label htmlFor={`modo-unico-${ep.id}`} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-3 cursor-pointer font-normal">
              <RadioGroupItem id={`modo-unico-${ep.id}`} value="unico" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Quantidade única</span>
                <span className="block text-xs text-muted-foreground">Um total só. O comprador escolhe o tamanho livremente.</span>
              </span>
            </Label>
            <Label htmlFor={`modo-tamanho-${ep.id}`} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-3 cursor-pointer font-normal">
              <RadioGroupItem id={`modo-tamanho-${ep.id}`} value="por_tamanho" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Por tamanho</span>
                <span className="block text-xs text-muted-foreground">Uma quantidade para cada tamanho. Acabou, o tamanho esgota.</span>
              </span>
            </Label>
          </RadioGroup>
        )}

        {form.modo !== doBanco.modo && linhasQueFicamParaTras.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              Este produto já tem vendas ou reservas contadas no modo atual. Elas não se perdem: ficam guardadas na contagem antiga, e a nova contagem começa do zero. Informe aqui só o que ainda pode ser vendido.
            </p>
          </div>
        )}

        {form.modo === 'unico' || !temGrade ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Input
              type="number"
              min={0}
              step={1}
              className="sm:w-32"
              value={form.qtdUnica}
              onChange={(e) => setForm((f) => ({ ...f, qtdUnica: e.target.value }))}
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground">{numeros(linhaUnica?.is_active ? linhaUnica : undefined)}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {variantes.map((v) => {
              const campo = form.tamanhos[v.id] ?? { incluido: false, qtd: '' };
              const linha = linhaDoTamanho(v.id);
              return (
                <div key={v.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="flex items-center gap-2 sm:w-28 cursor-pointer">
                    <Checkbox
                      checked={campo.incluido}
                      onCheckedChange={(c) =>
                        setForm((f) => ({ ...f, tamanhos: { ...f.tamanhos, [v.id]: { ...campo, incluido: c === true } } }))
                      }
                    />
                    <span className="text-sm font-medium">{v.label}</span>
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="sm:w-32"
                    disabled={!campo.incluido}
                    value={campo.qtd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tamanhos: { ...f.tamanhos, [v.id]: { ...campo, qtd: e.target.value } } }))
                    }
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground">
                    {campo.incluido ? numeros(linha?.is_active ? linha : undefined) : 'Este tamanho não é vendido neste evento'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {linhasForaDeUso.length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-1">
            <p className="text-xs text-muted-foreground">Contagem antiga, fora de uso (as vendas continuam valendo):</p>
            {linhasForaDeUso.map((s) => (
              <p key={s.id} className="text-xs text-muted-foreground">
                {rotuloDaLinha(s)}: vendidos {s.sold_quantity} · reservados {s.reserved_quantity}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* O que falta para ir à venda */}
      {ep.status !== 'active' && faltas.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-medium mb-1">Para colocar à venda, falta:</p>
          <ul className="text-sm list-disc pl-5 space-y-0.5">
            {faltas.map((f) => (
              <li key={f}>{NOME_DA_PENDENCIA[f] ?? f}</li>
            ))}
          </ul>
        </div>
      )}
      {ep.status !== 'active' && !pendenciasLoading && faltas.length === 0 && !alterado && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          Tudo pronto. É só colocar à venda.
        </p>
      )}

      {/* Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
        {alterado && ep.status !== 'active' && (
          <span className="text-xs text-muted-foreground sm:mr-auto">Salve as alterações antes de colocar à venda.</span>
        )}
        <Button variant="outline" disabled={!alterado || ocupado} onClick={() => salvar.mutate()}>
          <Save className="w-4 h-4 mr-2" />
          {salvar.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        {ep.status === 'active' ? (
          <Button variant="outline" disabled={ocupado} onClick={() => mudarEstado.mutate('paused')}>
            <Pause className="w-4 h-4 mr-2" />
            Pausar venda
          </Button>
        ) : (
          <Button variant="hero" disabled={!podeAtivar || ocupado} onClick={() => mudarEstado.mutate('active')}>
            <Play className="w-4 h-4 mr-2" />
            Colocar à venda
          </Button>
        )}
      </div>

      <AlertDialog open={removerAberto} onOpenChange={setRemoverAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar este produto do evento?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto continua no seu catálogo. Só o preço e a quantidade deste evento são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => remover.mutate()}>Tirar do evento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
