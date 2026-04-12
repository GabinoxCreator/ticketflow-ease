

# Revisão (Etapa 4) — Layout estilo Card de Evento

## Objetivo
Redesenhar a etapa de revisão para parecer com o card de listagem de eventos (`EventCard.tsx`), com banner enquadrado, informações sobrepostas e visual compacto.

## Mudanças no Step 4 (`CriarEvento.tsx`, linhas 638-719)

### Novo layout inspirado no EventCard:
- **Banner**: `aspect-[16/10]` com `object-cover`, gradiente `from-card via-transparent to-transparent` de baixo para cima
- **Data overlay**: Caixa posicionada no canto inferior esquerdo do banner (dia da semana + data formatada), igual ao EventCard
- **Título**: Sobreposto no banner, canto inferior esquerdo (acima do overlay de data), ou logo abaixo do banner em fonte grande
- **Conteúdo abaixo do banner**: padding `p-6`, com ícones de `MapPin` e `Clock` para local/horário, igual ao EventCard
- **Ingressos**: Cards com preço em destaque (`text-primary font-bold text-xl`), setor e quantidade em texto menor
- **Sem imagem**: Mostrar placeholder com fundo `bg-muted` e ícone

### Estrutura visual:
```text
┌──────────────────────────────────────┐
│  Banner 16:10 aspect ratio           │
│  ┌─────────┐                         │
│  │ Dia/Data │          Título grande  │
│  └─────────┘                         │
├──────────────────────────────────────┤
│ 📍 Local • Cidade    🕐 18:00-23:00 │
│ Duração: 5h                          │
│                                      │
│ Descrição do evento...               │
│                                      │
│ INGRESSOS (1)                        │
│ ┌──────────┐ ┌──────────┐           │
│ │ 1º Lote  │ │ 2º Lote  │           │
│ │ R$ 20,00 │ │ R$ 30,00 │           │
│ └──────────┘ └──────────┘           │
└──────────────────────────────────────┘
```

## Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Reescrever bloco `currentStep === 4` (linhas 638-719) |

