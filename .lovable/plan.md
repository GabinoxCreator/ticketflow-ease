## Objetivo

Admin global (`gabinox54037@gmail.com`) precisa enxergar e editar as seções **Produtora** e **Trackeamento** em `/produtor/configuracoes`, escolhendo qual produtora está gerenciando.

## Mudanças

### 1. `src/pages/ProducerSettings.tsx`

- Adicionar `useUserRole`/checagem via `userRole === 'admin'`.
- Se `userRole === 'admin'`:
  - Buscar lista de produtoras: `supabase.from('producer_profiles').select('id, brand_name, logo_url').order('brand_name')`. RLS já permite (`Admins can view all producer_profiles`).
  - Renderizar um seletor (Select shadcn) no topo do card "Configurações da Conta", logo abaixo do header, com label "Gerenciando produtora" e badge "Admin".
  - Estado local `selectedProducerId` (default: primeira da lista).
  - Trocar `producerProfileId` por `effectiveProducerId = userRole === 'admin' ? selectedProducerId : producerProfileId` em todos os pontos da página (query de `producer_profile`, condicional de render das seções Produtora/Trackeamento, update).
  - Ao trocar de produtora, recarregar dados (queryKey passa a usar `effectiveProducerId`).
- Para produtor normal: comportamento inalterado.

### 2. Sem mudanças de schema/RLS

- `Admins can view all producer_profiles` (SELECT) e `Admins can update producer_profiles` (UPDATE) já existem. O fluxo de salvamento funciona via RLS de admin.

## Validação manual

1. Logar como admin → ir em `/produtor/configuracoes` → ver o seletor de produtora no topo.
2. Selecionar uma produtora → seções "Produtora" e "Trackeamento" aparecem com dados dela.
3. Ativar tracking, salvar Pixel ID, clicar em "Salvar Configurações" → toast de sucesso.
4. Trocar para outra produtora → dados recarregam corretamente.
5. Logar como produtor normal → seletor não aparece, comportamento idêntico ao atual.
