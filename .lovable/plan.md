# Fix: tabs de "Meus Ingressos" quebrando no mobile

## Diagnóstico

Em `src/pages/MeusIngressos.tsx` (linhas 510–546), os `TabsTrigger` usam classes responsivas com prefixo `xs:` (`xs:hidden`, `xs:inline`).

O breakpoint `xs` **não está definido** em `tailwind.config.ts` (apenas os defaults `sm`, `md`, `lg`, etc.). Como resultado:

- `xs:hidden` e `xs:inline` são ignorados pelo Tailwind
- ambos os spans ("Próximos" e "Novos") renderizam ao mesmo tempo
- somado ao ícone + badge + `flex-1`, o conteúdo estoura a `TabsList` no viewport de 390px
- o tab ativo aparece "saindo" da borda arredondada (visível na screenshot)

## Correção

Apenas em `src/pages/MeusIngressos.tsx`:

1. Remover as classes `xs:` quebradas e usar uma única label por tab:
   - manter "Próximos" (consistente com a label do card de stats acima)
   - remover o `<span className="xs:hidden">Novos</span>` redundante
2. Reduzir levemente o gap e adicionar `min-w-0` + `truncate` no texto para evitar overflow em telas muito estreitas
3. Esconder o ícone do `Ticket` em telas <360px com `hidden sm:inline-flex` (opcional, melhora aperto)

Sem mudanças em layout, cores, ou em outras seções da página. Sem mudar Tailwind config.

## Arquivos impactados

- `src/pages/MeusIngressos.tsx` (somente o bloco `TabsList`/`TabsTrigger`)

## Validação manual

- Em 320px e 390px: as 3 tabs cabem dentro da `TabsList`, sem overflow visual
- Tab ativa fica contida na borda arredondada
- Contadores (badges) continuam visíveis
- Em ≥640px: layout idêntico ao atual (apenas labels consistentes)
