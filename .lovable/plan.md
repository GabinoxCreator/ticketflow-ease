

# Remover menu hamburger mobile — manter apenas dropdown do usuário

## Problema

O menu hamburger (☰) no mobile duplica as opções que já existem no dropdown do avatar (GF). Há conflito e redundância.

## Correção

### `src/components/Header.tsx`

1. Remover o botão de menu hamburger (`Menu`/`X` icon button)
2. Remover todo o bloco do mobile menu (`AnimatePresence` com `isMenuOpen`)
3. Remover o state `isMenuOpen`
4. Garantir que o dropdown do avatar (GF) fique sempre visível no mobile (remover `hidden` classes se houver)
5. Mostrar o botão "Entrar" também no mobile (remover `hidden sm:flex`)

O dropdown do usuário já contém: Meus Ingressos, Minha Conta, Painel do Produtor, Meus Eventos e Sair — tudo que o menu mobile tinha.

