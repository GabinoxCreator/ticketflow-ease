Plano para resolver o refresh repetindo:

1. Corrigir o erro provável no `EventTablesMapModal`
   - O componente usa `React.ReactNode`, mas não importa `React` como valor/tipo.
   - Isso pode quebrar o HMR/preview após a alteração recente e ficar tentando recarregar.
   - Ajustar o import para incluir `type ReactNode` e usar esse tipo no `FilterChip`.

2. Remover hardcodes problemáticos no SVG do modal
   - Trocar cores hex diretas usadas na ilustração por classes/tokens ou props sem violar o padrão do projeto.
   - Manter o visual da ilustração de mesas reservadas sem mexer na regra de negócio.

3. Verificar se o preview estabilizou
   - Checar logs recentes do Vite após a mudança.
   - Confirmar que não há erro de compilação/HMR e que o app não fica em reload loop.

Escopo: só vou mexer na causa do refresh relacionada à última área alterada do mapa/modal de mesas; não vou alterar backend, autenticação ou fluxo de venda.