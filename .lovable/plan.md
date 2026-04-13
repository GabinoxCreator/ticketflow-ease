

# Reestruturação Completa da Área do Colaborador — 6 Blocos

## Resumo
Substituir as 4 páginas separadas (menu, scanner, participantes, convidados) por uma única tela operacional com bottom nav fixa (QR Code | Listas), scanner contínuo fullscreen, e busca manual integrada.

## Bloco 1: Tela de Eventos (já implementada)
`ColaboradorEventos.tsx` já existe com abas Próximos/Passados e botão "Fazer Check-in". Nenhuma alteração necessária.

## Bloco 2: Tela Operacional + Bottom Nav

**Criar arquivos:**
- `src/components/colaborador/ColaboradorBottomNav.tsx` — bottom nav fixa com 2 abas (QR Code, Listas) usando ícones `QrCode` e `List`
- `src/pages/colaborador/ColaboradorEvento.tsx` — substitui `ColaboradorEventoMenu.tsx`. Header com nome do evento, data/hora, botão voltar, e 3 indicadores (check-ins, pendentes, total). Renderiza `ColaboradorQRTab` ou `ColaboradorListasTab` conforme aba ativa

**Atualizar:**
- `src/App.tsx` — rota `/colaborador/evento/:id` aponta para `ColaboradorEvento` em vez de `ColaboradorEventoMenu`. Remover rotas separadas de scanner, participantes e convidados. Manter redirects para compatibilidade

## Bloco 3: Scanner QR Fullscreen Contínuo

**Criar arquivos:**
- `src/components/colaborador/ColaboradorQRTab.tsx` — aba principal com botão grande "Escanear QR Code" + área de busca manual (Bloco 4)
- `src/components/colaborador/ColaboradorQRScanner.tsx` — modal fullscreen com scanner contínuo:
  - Câmera abre imediatamente
  - Ao ler QR, chama `collaborator-validate-ticket` com `action: 'validate'` direto (sem etapa de check/confirm)
  - Overlay de resultado por 3s (verde/amarelo/vermelho) sem parar o scanner
  - Debounce de 5s por código (Map com timestamps)
  - Vibração no feedback
  - Botão X para fechar
  - Reaproveita html5-qrcode já instalado

## Bloco 4: Busca Manual

Implementado dentro de `ColaboradorQRTab.tsx`:
- Campo de busca por código, nome, email ou telefone
- Chama edge function `collaborator-validate-ticket` com `action: 'check'` para buscar
- Resultados em cards com botão "Check-in" que chama `action: 'validate'`
- Para busca por nome/email/telefone, criar nova edge function `collaborator-search-tickets` que faz query textual nos campos holder_name, holder_email, holder_phone

**Criar:**
- `supabase/functions/collaborator-search-tickets/index.ts` — busca por nome/email/telefone com validação de sessão, retorna lista de tickets

## Bloco 5: Aba Listas

**Criar arquivos:**
- `src/components/colaborador/ColaboradorListasTab.tsx` — cards das listas do evento com nome, pendentes, check-ins. Ao clicar, abre detalhe
- `src/components/colaborador/ColaboradorListaDetalhe.tsx` — título, contadores, busca por nome, lista de participantes com botão "Entrada" que chama `collaborator-validate-guest-entry`

Dados: busca listas via nova edge function ou reaproveita a query direta ao supabase que `ColaboradorConvidados` já faz (guest_lists + guest_list_entries por event_id)

## Bloco 6: Logs de Check-in + Ajustes

**Atualizar edge functions:**
- `collaborator-validate-ticket/index.ts` — após validar ticket, inserir em `checkin_logs` com `collaborator_id`, `source` (recebido do frontend: `scanner_qr` ou `busca_manual`), `action: 'checkin'`
- `collaborator-validate-guest-entry/index.ts` — após check-in de convidado, inserir em `checkin_logs` com `collaborator_id`, `source: 'lista'`

**Adicionar parâmetro `source`** nas chamadas do frontend para as edge functions.

## Arquivos Impactados

| Arquivo | Ação |
|---|---|
| `src/pages/colaborador/ColaboradorEvento.tsx` | Criar (substitui ColaboradorEventoMenu) |
| `src/components/colaborador/ColaboradorBottomNav.tsx` | Criar |
| `src/components/colaborador/ColaboradorQRTab.tsx` | Criar |
| `src/components/colaborador/ColaboradorQRScanner.tsx` | Criar |
| `src/components/colaborador/ColaboradorListasTab.tsx` | Criar |
| `src/components/colaborador/ColaboradorListaDetalhe.tsx` | Criar |
| `supabase/functions/collaborator-search-tickets/index.ts` | Criar |
| `supabase/functions/collaborator-validate-ticket/index.ts` | Atualizar (add checkin_logs + source) |
| `supabase/functions/collaborator-validate-guest-entry/index.ts` | Atualizar (add checkin_logs + source) |
| `src/App.tsx` | Atualizar rotas |

## Arquivos que NÃO serão alterados
- Painel do produtor (sem impacto)
- Admin (sem impacto)
- Fluxo público de compra (sem impacto)
- `ColaboradorAuthContext` (100% reaproveitado)
- `ColaboradorProtectedRoute` (100% reaproveitado)
- `ColaboradorLogin` (sem alteração)
- `ColaboradorEventos` (sem alteração)

## Riscos Técnicos
1. html5-qrcode pode precisar de stop/restart para "contínuo" — usaremos debounce em vez de parar
2. Busca textual por nome/email requer nova edge function (não dá pelo client sem auth supabase)
3. `checkin_logs.ticket_id` é NOT NULL — para guest_list_entries precisaremos de um valor ou alterar para nullable via migration

## Detalhes Técnicos

### Bottom Nav
```tsx
<div className="fixed bottom-0 left-0 right-0 bg-card border-t z-20">
  <div className="max-w-lg mx-auto flex">
    <button onClick={() => setTab('qr')} className="flex-1 py-3 ...">
      <QrCode /> QR Code
    </button>
    <button onClick={() => setTab('listas')} className="flex-1 py-3 ...">
      <List /> Listas
    </button>
  </div>
</div>
```

### Scanner Contínuo (debounce)
```tsx
const recentScans = useRef(new Map<string, number>());
const onScan = (code: string) => {
  const now = Date.now();
  if (recentScans.current.get(code) && now - recentScans.current.get(code)! < 5000) return;
  recentScans.current.set(code, now);
  validateTicket(code); // action=validate direto
};
```

### Migration necessária
`checkin_logs.ticket_id` precisa ser nullable para suportar check-ins de guest_list_entries (que não têm ticket_id). Adicionar coluna `guest_entry_id uuid` nullable.

