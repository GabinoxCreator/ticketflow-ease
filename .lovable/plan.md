

# Corrigir Página "Meus Ingressos" em Branco

## Problema

Após adicionar o status `'pending'` aos tickets, o componente `TicketCardSimple` em `MeusIngressos.tsx` tenta acessar `statusConfig['pending']`, que não existe. Isso causa um crash: `Cannot read properties of undefined (reading 'icon')`.

## Solução

Duas correções:

### 1. `src/hooks/useUserTickets.ts`
- Filtrar tickets `'pending'` para que não apareçam na lista (ingressos pendentes de pagamento não devem ser exibidos ao usuário)
- Atualizar a interface `UserTicket` para incluir `'pending'` no tipo de status

### 2. `src/pages/MeusIngressos.tsx`
- Adicionar `'pending'` ao `statusConfig` como medida de segurança, caso algum ticket pendente passe pelo filtro

### Correção de dados
- O ticket `ccbf4216` foi criado como `'valid'` com order `'pending'` (antes do deploy da correção). Executar migração SQL para corrigir:
```sql
UPDATE tickets SET status = 'pending' 
WHERE order_id IN (SELECT id FROM orders WHERE status = 'pending')
AND status = 'valid';
```

