# Ajustes no Rodapé (Footer)

Vamos limpar os links do rodapé em `src/components/Footer.tsx` para refletir apenas o que está em uso hoje.

## Mudanças

**Coluna "Plataforma":**
- Remover: Preços, Blog
- Manter: Para Produtores (`/area-do-produtor`)
- Adicionar: Para Consumidores → aponta para `/` (home, onde ficam os eventos)

**Coluna "Suporte":**
- Remover: Contato, FAQ
- Manter: Central de Ajuda (`/ajuda`) e Termos de Uso (`/termos`)

**Barra inferior (legal):**
- Manter: Política de Privacidade (`/privacidade`), Política de Reembolso (`/reembolso`), Termos de Uso (`/termos`)
- Sem alterações de conteúdo aqui — só vamos garantir que os links continuem.

## Próximos passos (após aprovar este ajuste)

Depois desta limpeza, restarão duas páginas a criar em conversas seguintes:
1. **Central de Ajuda** (`/ajuda`)
2. **Política de Reembolso** (`/reembolso`)

Ambas hoje apontam para rotas que ainda não existem. Vamos criá-las juntos depois, conforme você pediu.

## Escopo

- Apenas `src/components/Footer.tsx`.
- Sem mexer em rotas, backend ou outras páginas neste momento.
