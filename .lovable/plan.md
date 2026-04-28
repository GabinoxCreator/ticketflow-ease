## Remover aba "Pedidos" global do menu de gestão do produtor

A aba "Pedidos" do menu lateral (Gestão) será removida. Os pedidos continuam acessíveis dentro do dashboard de cada evento (aba Pedidos por evento), que é o fluxo desejado.

### Mudanças

1. **`src/components/producer/ProducerSidebar.tsx`**
   - Remover o item `{ title: 'Pedidos', url: '/produtor/pedidos', icon: ClipboardList }` da lista de navegação (seção Gestão).
   - Limpar o import de `ClipboardList` se não for mais usado.

2. **`src/App.tsx`**
   - Remover a rota `<Route path="/produtor/pedidos" ... />`.
   - Remover o import `import ProducerOrders from "./pages/ProducerOrders"`.

3. **`src/pages/ProducerOrders.tsx`**
   - Deletar o arquivo (não há mais referências após as remoções acima).

### Fora de escopo
- Aba "Pedidos" dentro do dashboard de cada evento (`EventOrdersTab`) permanece intacta.
- Nenhuma mudança de banco de dados ou RLS.
