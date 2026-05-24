## Problema

No painel do colaborador (desktop), ao clicar no card de uma lista de convidados, os nomes não aparecem. No celular (mesmo login) funciona normalmente.

## Diagnóstico provável

`ColaboradorListaDetalhe.tsx` recebe `entries` como prop e usa:

```ts
const [localEntries, setLocalEntries] = useState(entries);
```

Como `useState(entries)` só lê o valor na montagem, se a busca inicial em `ColaboradorListasTab` retornou a lista com `guest_list_entries` vazio (por timing ou cache do PostgREST com JOIN aninhado) e o componente já foi montado, os nomes nunca aparecem mesmo que existam no banco. No celular o fetch pode estar retornando completo por ser uma segunda visita.

Além disso, hoje não há refetch ao abrir uma lista — confiamos 100% no payload inicial do JOIN aninhado `guest_lists(... guest_list_entries(...))`, que pode falhar parcialmente em listas grandes (282 convidados no exemplo) por limite de 1000 linhas do PostgREST quando combinado com várias listas.

## Plano

### 1. Refetch dedicado das entradas ao abrir uma lista
Em `src/components/colaborador/ColaboradorListasTab.tsx`:
- Ao clicar num card, antes de abrir o detalhe, fazer um `SELECT` direto em `guest_list_entries` filtrando por `guest_list_id` (sem JOIN aninhado). Isso garante todos os nomes mesmo em listas grandes.
- Mostrar um loader curto enquanto busca.
- Passar essas entradas frescas para `ColaboradorListaDetalhe`.

### 2. Sincronizar prop → estado em `ColaboradorListaDetalhe`
Em `src/components/colaborador/ColaboradorListaDetalhe.tsx`:
- Substituir `useState(entries)` por estado que sincroniza com a prop via `useEffect([entries])`, garantindo que mudanças no array vindo do pai sejam refletidas.

### 3. Mensagem clara quando a lista vier vazia
Se após o refetch a lista realmente não tem nomes, mostrar "Nenhum convidado cadastrado ainda" em vez de área em branco (hoje cai no filtro e diz "Nenhum convidado encontrado", confunde com busca).

### 4. Botão de atualizar dentro do detalhe
Adicionar um pequeno botão "Atualizar" no cabeçalho do detalhe que refaz o fetch das entradas dessa lista. Útil em caixa quando entram inscrições novas.

### 5. Validação
- Abrir a mesma lista no preview desktop logado como colaborador.
- Confirmar que os 282 nomes aparecem.
- Conferir busca, click no nome e check-in continuam funcionando.

## Arquivos a alterar

- `src/components/colaborador/ColaboradorListasTab.tsx`
- `src/components/colaborador/ColaboradorListaDetalhe.tsx`

Sem mudanças no banco ou em edge functions.
