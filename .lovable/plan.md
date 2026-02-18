

# Simplificar Tela Inicial - Remover Hero e Mostrar Eventos Direto

## O que sera feito

Remover o componente Hero (aquele espaco vazio com gradientes) e o filtro de categorias da pagina inicial. O conteudo comecara direto com a lista "Proximos Eventos" logo apos o Header.

## Alteracoes

### Arquivo: `src/pages/Index.tsx`

- Remover import do `Hero` e `CategoryFilter`
- Remover o state `selectedCategory` (nao sera mais necessario)
- Remover `<Hero />` e `<CategoryFilter />` do JSX
- Passar todos os eventos direto para o `EventGrid` (sem filtro de categoria)
- Adicionar um `pt-24` no main para compensar o header fixo

### Arquivos que podem ser deletados (opcional)

- `src/components/Hero.tsx` - nao sera mais usado
- `src/components/CategoryFilter.tsx` - nao sera mais usado

