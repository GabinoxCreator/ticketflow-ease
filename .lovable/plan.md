## Plano — Remover botões de criação na página Meus Eventos

Em `src/pages/DashboardEventos.tsx`:

1. **Header**: remover o botão "Criar Evento" (gradiente Indigo→Magenta) que fica ao lado do título. O header fica só com o chip de contagem, título e subtítulo.

2. **Empty states**: remover o botão "Criar meu primeiro evento" do componente `EmptyState`. Removo também a prop `onAction`/`actionLabel` e as chamadas `onAction={...}` em `renderEventList`. Os empty states ficam apenas com ícone, título e mensagem.

3. **Limpeza**: remover imports não usados (`Plus`, `Button`, `useNavigate`) já que nenhum outro lugar do arquivo navega para criar evento.

Sem mudanças em outros arquivos, rotas ou banco. A criação de evento continua acessível pelo sidebar do produtor.