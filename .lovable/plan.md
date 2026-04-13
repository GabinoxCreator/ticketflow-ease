

# Botões da etapa final: layout mobile empilhado

## Problema
No mobile, os 3 botões (Anterior, Salvar Rascunho, Publicar Evento) ficam em uma linha só e o "Publicar Evento" é cortado/sai do card.

## Solução
Na etapa 4, reorganizar os botões para que no mobile:
- **Linha 1**: "Anterior" e "Salvar Rascunho" lado a lado
- **Linha 2**: "Publicar Evento" ocupando toda a largura (`w-full`)

### Mudança em `src/pages/CriarEvento.tsx` (linhas 733-760)

Substituir o layout atual por:
```tsx
<div className="flex flex-col gap-2 mt-4">
  <div className="flex justify-between">
    <Button variant="outline" size="sm" onClick={prevStep}>
      <ArrowLeft /> Anterior
    </Button>
    <Button variant="outline" size="sm" onClick={() => handleSubmit('draft')}>
      Salvar Rascunho
    </Button>
  </div>
  <Button size="sm" className="w-full" onClick={() => handleSubmit('published')}>
    Publicar Evento
  </Button>
</div>
```

No desktop, manter o mesmo visual empilhado — é funcional e consistente.

## Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Reorganizar botões da etapa 4 em duas linhas |

