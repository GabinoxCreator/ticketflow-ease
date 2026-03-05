

# Corrigir Botão de Pagamento com Cartão

## Problema

A variável `VITE_MERCADOPAGO_PUBLIC_KEY` não está no arquivo `.env` do projeto. Ela existe como secret do backend, mas variáveis `VITE_` precisam estar no `.env` para serem acessíveis no frontend via `import.meta.env`. Como resultado, `publicKey` é `undefined`, `mpReady` nunca vira `true`, e o botão fica permanentemente desabilitado.

## Solução

O `.env` é gerenciado automaticamente e não pode ser editado diretamente. A solução é **não depender do `.env`** para essa chave pública. Em vez disso, buscar a public key de uma forma que funcione:

**Opção 1 (recomendada)**: Hardcodar a public key do Mercado Pago diretamente no código, já que é uma chave **pública** (não é segredo). Chaves públicas do MP são feitas para serem expostas no frontend.

**Opção 2**: Criar uma edge function que retorna a public key a partir dos secrets do backend.

### Implementação (Opção 1)

**`src/components/checkout/CheckoutStepCard.tsx`**:
- Remover `const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY`
- Substituir por uma constante ou buscar via edge function
- Como não sei a public key exata, vou criar uma edge function simples `get-mercadopago-public-key` que retorna o valor do secret, e o `CheckoutStepCard` faz um fetch dessa key ao montar

### Edge Function: `get-mercadopago-public-key`
- Lê `VITE_MERCADOPAGO_PUBLIC_KEY` dos env vars do Deno
- Retorna como JSON

### Alteração em `CheckoutStepCard.tsx`
- No `useEffect` de inicialização, fazer fetch da public key via edge function
- Após obter a key, inicializar o SDK do MercadoPago
- O botão ficará habilitado assim que o SDK estiver pronto

