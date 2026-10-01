import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventLot } from '@/hooks/useEventLots';
import { useInvalidarLoja } from '@/hooks/useLojaDoEvento';
import { nomeDoLote, problemasDoCombo, somaDasPartes } from '@/lib/loja/combos';
import {
  lojaDb,
  centavos,
  lerValor,
  nomeDoProduto,
  reais,
  NOME_DO_ESTADO,
  type ComboCompleto,
  type ItemDoCombo,
  type ProdutoNoEventoCompleto,
} from '@/lib/loja/tipos';
import { cn } from '@/lib/utils';

interface LinhaDoForm {
  id?: string;
  /** "lot:<id>" ou "product:<id>". Vazio = ainda não escolheu. */
  alvo: string;
  quantity: string;
  share: string;
}

interface FormDoCombo {
  name: string;
  description: string;
  price: string;
  itens: LinhaDoForm[];
}

const LINHA_VAZIA: LinhaDoForm = { alvo: '', quantity: '1', share: '' };
const dinheiroNoCampo = (v: number | null | undefined) => (v != null ? String(v).replace('.', ',') : '');

function formDoCombo(combo: ComboCompleto | null): FormDoCombo {
  if (!combo) return { name: '', description: '', price: '', itens: [{ ...LINHA_VAZIA }] };
  return {
    name: combo.name,
    description: combo.description ?? '',
    price: dinheiroNoCampo(combo.price),
    itens: combo.items.map((i) => ({
      id: i.id,
      alvo: i.kind === 'lot' ? `lot:${i.lot_id}` : `product:${i.event_product_id}`,
      quantity: String(i.quantity),
      share: dinheiroNoCampo(i.unit_face_share),
    })),
  };
}

type ItemLido = Pick<ItemDoCombo, 'kind' | 'lot_id' | 'event_product_id' | 'quantity' | 'unit_face_share'> & { id?: string };

// O que der para ler do formulário, para a conta ao vivo. Linha sem escolha
// fica de fora; número inválido conta como zero.
function lerItens(itens: LinhaDoForm[]): ItemLido[] {
  return itens
    .filter((l) => l.alvo)
    .map((l) => {
      const [kind, alvoId] = l.alvo.split(':') as ['lot' | 'product', string];
      return {
        id: l.id,
        kind,
        lot_id: kind === 'lot' ? alvoId : null,
        event_product_id: kind === 'product' ? alvoId : null,
        quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)),
        unit_face_share: lerValor(l.share) ?? 0,
      };
    });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  combo: ComboCompleto | null;
  proximaOrdem: number;
  lots: EventLot[];
  produtos: ProdutoNoEventoCompleto[];
}

export function ComboDialog({ open, onOpenChange, eventId, combo, proximaOrdem, lots, produtos }: Props) {
  const invalidar = useInvalidarLoja(eventId);
  const [form, setForm] = useState<FormDoCombo>(() => formDoCombo(combo));

  useEffect(() => {
    if (open) setForm(formDoCombo(combo));
  }, [open, combo]);

  const preco = lerValor(form.price);
  const itensLidos = lerItens(form.itens);
  const soma = somaDasPartes(itensLidos);
  const diferenca = centavos(preco) - soma;
  const bate = itensLidos.length > 0 && preco != null && diferenca === 0;
  const problemas = problemasDoCombo(preco, itensLidos, lots, produtos);

  const mudarLinha = (indice: number, parte: Partial<LinhaDoForm>) =>
    setForm((f) => ({ ...f, itens: f.itens.map((l, i) => (i === indice ? { ...l, ...parte } : l)) }));

  // Preço de tabela do item escolhido, só como referência para repartir.
  const precoSozinho = (alvo: string): number | null => {
    const [kind, alvoId] = alvo.split(':');
    if (kind === 'lot') return lots.find((l) => l.id === alvoId)?.price ?? null;
    if (kind === 'product') return produtos.find((p) => p.id === alvoId)?.price ?? null;
    return null;
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Dê um nome ao combo.');
      if (preco == null || preco < 0) throw new Error('Informe o preço do combo, por exemplo 150,00.');

      for (const l of form.itens) {
        if (!l.alvo) throw new Error('Escolha o ingresso ou o produto de cada linha, ou tire a linha vazia.');
        const qtd = Number(l.quantity);
        if (!Number.isInteger(qtd) || qtd < 1) throw new Error('A quantidade de cada item tem de ser 1 ou mais.');
        const fatia = lerValor(l.share);
        if (fatia == null || fatia < 0) throw new Error('Informe quanto do preço do combo cabe a cada item.');
      }

      // Combo que já está à venda não pode ser salvo quebrado: o servidor
      // recusaria a compra de quem está na página agora.
      if (combo?.status === 'active' && problemas.length > 0) {
        throw new Error('Este combo está à venda. Pause antes de salvar assim: ' + problemas.join('; ') + '.');
      }

      const dados = { name: form.name.trim(), description: form.description.trim() || null, price: preco };
      let bundleId = combo?.id;
      if (bundleId) {
        const { error } = await lojaDb
          .from('event_bundles')
          .update({ ...dados, updated_at: new Date().toISOString() })
          .eq('id', bundleId);
        if (error) throw error;
      } else {
        const { data, error } = await lojaDb
          .from('event_bundles')
          .insert({ ...dados, event_id: eventId, status: 'draft', sort_order: proximaOrdem })
          .select('id')
          .single();
        if (error) throw error;
        bundleId = data.id;
      }

      const campos = (i: ItemLido) => ({
        kind: i.kind,
        lot_id: i.lot_id,
        event_product_id: i.event_product_id,
        quantity: i.quantity,
        unit_face_share: i.unit_face_share,
      });

      const ficam = new Set(itensLidos.filter((i) => i.id).map((i) => i.id));
      const sairam = (combo?.items ?? []).filter((i) => !ficam.has(i.id)).map((i) => i.id);
      if (sairam.length > 0) {
        const { error } = await lojaDb.from('event_bundle_items').delete().in('id', sairam);
        if (error) throw error;
      }
      for (const item of itensLidos.filter((i) => i.id)) {
        const { error } = await lojaDb.from('event_bundle_items').update(campos(item)).eq('id', item.id);
        if (error) throw error;
      }
      const novos = itensLidos.filter((i) => !i.id).map((i) => ({ ...campos(i), bundle_id: bundleId }));
      if (novos.length > 0) {
        const { error } = await lojaDb.from('event_bundle_items').insert(novos);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidar();
      toast.success(combo ? 'Combo atualizado!' : 'Combo criado como rascunho. Confira e ative quando quiser.');
      onOpenChange(false);
    },
    onError: (e: Error) => {
      // Pode ter salvo uma parte: recarrega para a tela mostrar o que valeu.
      invalidar();
      toast.error(e.message);
    },
  });

  const semOpcoes = lots.length === 0 && produtos.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{combo ? 'Editar combo' : 'Novo combo'}</DialogTitle>
          <DialogDescription>
            O combo tem preço próprio. Você decide quanto desse preço cabe a cada item: é esse valor que entra no seu relatório e no repasse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-2">
              <Label htmlFor="combo-nome">Nome *</Label>
              <Input
                id="combo-nome"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Convite + camiseta"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="combo-preco">Preço do combo (R$) *</Label>
              <Input
                id="combo-preco"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="combo-descricao">Descrição</Label>
            <Textarea
              id="combo-descricao"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="O que vem no combo, do jeito que o comprador vai ler"
            />
          </div>

          {/* Itens */}
          <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/50">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">O que vem no combo</p>

            {semOpcoes && (
              <p className="text-sm text-muted-foreground">
                Este evento ainda não tem ingresso nem produto para colocar no combo.
              </p>
            )}

            {form.itens.map((linha, indice) => {
              const sozinho = linha.alvo ? precoSozinho(linha.alvo) : null;
              return (
                <div key={linha.id ?? `nova-${indice}`} className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Item</Label>
                      <Select value={linha.alvo || undefined} onValueChange={(v) => mudarLinha(indice, { alvo: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um ingresso ou produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {lots.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Ingressos</SelectLabel>
                              {lots.map((l) => (
                                <SelectItem key={l.id} value={`lot:${l.id}`}>
                                  {nomeDoLote(l)}
                                  {!l.is_active ? ' (desativado)' : ''}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {produtos.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Produtos</SelectLabel>
                              {produtos.map((p) => (
                                <SelectItem key={p.id} value={`product:${p.id}`}>
                                  {nomeDoProduto(p.product)}
                                  {p.status !== 'active' ? ` (${NOME_DO_ESTADO[p.status].toLowerCase()})` : ''}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qtd.</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={linha.quantity}
                        onChange={(e) => mudarLinha(indice, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Parte do preço (R$)</Label>
                      <Input
                        inputMode="decimal"
                        value={linha.share}
                        onChange={(e) => mudarLinha(indice, { share: e.target.value })}
                        placeholder="0,00"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Tirar item"
                      onClick={() => setForm((f) => ({ ...f, itens: f.itens.filter((_, i) => i !== indice) }))}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  {sozinho != null && (
                    <p className="text-xs text-muted-foreground">
                      Vendido sozinho: {reais(sozinho)} cada. A parte do preço é por unidade.
                    </p>
                  )}
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={semOpcoes}
              onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, { ...LINHA_VAZIA }] }))}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar item
            </Button>
          </div>

          {/* A conta ao vivo */}
          <div
            className={cn(
              'rounded-xl border p-4 space-y-1',
              bate ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10',
            )}
          >
            <div className="flex items-center justify-between text-sm">
              <span>Soma das partes</span>
              <span className="font-mono font-semibold">{reais(soma / 100)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Preço do combo</span>
              <span className="font-mono font-semibold">{reais(preco)}</span>
            </div>
            <p className="flex items-center gap-2 text-sm font-medium pt-1">
              {bate ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  A conta fecha.
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  {itensLidos.length === 0
                    ? 'Adicione os itens do combo.'
                    : diferenca > 0
                      ? `Faltam ${reais(diferenca / 100)} para fechar com o preço do combo.`
                      : `Passou ${reais(-diferenca / 100)} do preço do combo.`}
                </>
              )}
            </p>
            {!bate && (
              <p className="text-xs text-muted-foreground">
                Você pode salvar assim, como rascunho. O combo só pode ser ativado quando a conta fechar ao centavo.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : combo ? 'Salvar alterações' : 'Criar combo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
