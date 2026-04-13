

# Fix: Inputs de Preço e Quantidade não permitem limpar o valor

## Problema
Os campos de Preço e Quantidade usam `parseFloat(value) || 0` e `parseInt(value) || 1`, o que impede o usuário de apagar o valor atual para digitar um novo — o campo volta instantaneamente para 0 ou 1.

## Solução
Usar estado intermediário como string para permitir o campo ficar vazio temporariamente, convertendo para número apenas no `onBlur`. Na prática, a forma mais simples é:

- Mudar `value={lot.price}` para permitir string vazia
- No `onChange`, aceitar o valor como string (incluindo vazio)
- No `onBlur`, aplicar o fallback (0 para preço, 1 para quantidade)

### Mudança em `src/pages/CriarEvento.tsx` (linhas 456 e 460):

**Preço** (linha 456):
```tsx
<Input type="number" step="0.01" min="0"
  value={lot.price === 0 ? '' : lot.price}
  onChange={(e) => updateLot(lot.id, { price: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
  onBlur={(e) => { if (e.target.value === '') updateLot(lot.id, { price: 0 }); }}
  className="h-8 text-sm" />
```

**Quantidade** (linha 460):
```tsx
<Input type="number" min="1"
  value={lot.total_quantity === 0 ? '' : lot.total_quantity}
  onChange={(e) => updateLot(lot.id, { total_quantity: e.target.value === '' ? 0 : parseInt(e.target.value) })}
  onBlur={(e) => { if (e.target.value === '' || parseInt(e.target.value) < 1) updateLot(lot.id, { total_quantity: 1 }); }}
  className="h-8 text-sm" />
```

Mesma correção deve ser aplicada em qualquer outro input numérico no mesmo arquivo que use o padrão `|| 0` ou `|| 1`.

## Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Permitir campos numéricos ficarem vazios durante edição |

