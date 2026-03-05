

# Simplificar Header — remover links de navegação

## Alteração

Remover os links "Eventos", "Categorias", "Como Funciona" e "Para Produtores" do Header, tanto no desktop quanto no menu mobile.

### Arquivo: `src/components/Header.tsx`

1. Remover o array `navLinks` e toda a seção `<nav>` do desktop
2. Remover o bloco que renderiza `navLinks` no menu mobile
3. Manter: logo, busca, botões de ação (Meus Ingressos, Criar Evento, dropdown do usuário, login) e o menu mobile apenas com as opções do usuário

