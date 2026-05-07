## Escopo

Apenas ajustes visuais no header do `AuthModal` em mobile. Sem mexer em lógica.

## Mudanças

Arquivo único: `src/components/auth/AuthModal.tsx`

### Header em mobile (<768px)
- Adicionar botão de **voltar** (ícone `ArrowLeft`) no canto esquerdo, que chama `onClose()` (mesma ação do X já existente — fecha o modal e volta para o evento).
- **Centralizar** o título "Entrar" / "Criar Conta" / "Recuperar Senha".
- Centralizar também o subtítulo abaixo.
- Manter o close nativo (X) do `DialogContent` no canto direito — o botão voltar fica simétrico a ele.
- Layout: grid `[botão voltar] [título centralizado] [espaço para o X]`.

### Header em desktop
- Sem mudanças (título alinhado à esquerda, sem botão voltar — usuário fecha pelo X ou clicando fora).

## Comportamento preservado
- `onClose`, tabs, etapas, validações, OTP, social login, forgot password — nada alterado.

## Checklist
1. Mobile: aparece seta de voltar à esquerda do título.
2. Mobile: título "Entrar" centralizado.
3. Clicar na seta fecha o modal e volta ao evento.
4. X nativo continua visível à direita (sem duplicação).
5. Desktop inalterado.
