

# Botão "Salvar" ao lado do input de nome do setor

## Mudança
Adicionar um botão "Salvar" (ícone Check) ao lado do input de edição do nome do setor, para que o usuário saiba como confirmar a alteração sem depender apenas de clicar fora.

## Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Adicionar botão com ícone `Check` ao lado do Input do setor (linhas 403-419) |

## Detalhes técnicos
No bloco onde `editingSectorId === lot.id` (linhas 403-419), envolver o `Input` em um `div flex` e adicionar um `Button` com ícone `Check` (lucide-react) que executa a mesma lógica de salvar:
```tsx
<div className="flex items-center gap-1">
  <Input ... />
  <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
    onClick={() => {
      updateLot(lot.id, { sector_name: editingSectorName || 'Ingressos' });
      setEditingSectorId(null);
    }}>
    <Check className="w-4 h-4" />
  </Button>
</div>
```

