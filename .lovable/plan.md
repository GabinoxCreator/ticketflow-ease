

# Reestruturação da Área do Colaborador — Mobile-First Check-in

## 1. Diagnóstico da Área Atual

A área do colaborador já existe com:
- **Login** (`/colaborador`) — funcional, com sessão via edge function + bcrypt
- **Dashboard** (`/colaborador/dashboard`) — lista eventos do colaborador
- **Menu do Evento** (`/colaborador/evento/:id`) — 3 opções: QR Code, Participantes, Convidados
- **Scanner QR** (`/colaborador/evento/:id/scanner`) — lê QR, mas para o scanner após cada leitura e exige confirmação manual ("Validar Ingresso")
- **Participantes** (`/colaborador/evento/:id/participantes`) — lista todos os ingressos vendidos
- **Convidados** (`/colaborador/evento/:id/convidados`) — mistura cortesias + listas de convidados

**Problemas principais:**
- Scanner para após cada leitura (não é contínuo)
- Exige ação extra "Validar Ingresso" após escanear (2 steps em vez de 1)
- Navegação por páginas separadas em vez de abas dentro da tela operacional
- Sem bottom nav fixa
- Sem indicadores de check-in/pendentes na tela operacional
- Mistura de participantes pagos e convidados de lista em telas separadas sem clareza

## 2. O Que Já Existe e Pode Ser Reaproveitado

| Componente | Status |
|---|---|
| `ColaboradorAuthContext` (login, sessão, logout) | 100% reaproveitável |
| `ColaboradorProtectedRoute` | 100% reaproveitável |
| `ColaboradorLogin` | 95% — apenas ajuste visual menor |
| `collaborator-login` edge function | 100% reaproveitável |
| `collaborator-validate-ticket` edge function | 95% — mudar para validação automática (action=validate direto) |
| `collaborator-validate-guest-entry` edge function | 100% reaproveitável |
| `checkin_logs` table | Existe mas não está sendo usada pelo colaborador — integrar |
| `collaborator_events` table + RLS | 100% reaproveitável |
| `collaborator_sessions` table | 100% reaproveitável |
| html5-qrcode library | 100% reaproveitável |
| Tickets query com event_lots join | Reaproveitável |
| Guest lists query | Reaproveitável |

## 3. Proposta de Nova Arquitetura de Rotas

```text
/colaborador                          → Login
/colaborador/eventos                  → Lista de eventos (substitui /dashboard)
/colaborador/evento/:id               → Tela operacional com bottom nav (QR Code | Listas)
```

Remover rotas separadas de scanner, participantes e convidados. Tudo fica dentro da tela operacional via abas.

## 4. Proposta de Páginas e Componentes

### Páginas (3 no total)
1. `ColaboradorLogin.tsx` — manter (ajuste mínimo)
2. `ColaboradorEventos.tsx` — **NOVA** (substitui ColaboradorDashboard)
3. `ColaboradorEvento.tsx` — **NOVA** (substitui ColaboradorEventoMenu + scanner + participantes + convidados)

### Componentes novos (dentro de `src/components/colaborador/`)
1. `ColaboradorProtectedRoute.tsx` — manter
2. `ColaboradorBottomNav.tsx` — bottom nav fixa (QR Code | Listas)
3. `ColaboradorQRTab.tsx` — aba QR com scanner fullscreen + busca manual
4. `ColaboradorListasTab.tsx` — aba Listas com cards de listas
5. `ColaboradorListaDetalhe.tsx` — detalhe de uma lista com participantes
6. `ColaboradorQRScanner.tsx` — scanner fullscreen contínuo com feedback overlay
7. `ColaboradorTicketResult.tsx` — overlay de resultado do scan (válido/usado/inválido)

## 5. Proposta de Fluxo da Aba QR Code

```text
Aba QR Code
├── Botão grande "Escanear QR Code" (abre fullscreen)
├── Busca manual (código, nome, email, telefone)
└── Resultados de busca com botão "Check-in"

Fullscreen Scanner:
├── Câmera abre imediatamente
├── QR lido → validate automático (sem confirmação)
├── Overlay de resultado (2-3s):
│   ├── ✅ Verde: "Check-in realizado" + nome + lote
│   ├── ⚠️ Amarelo: "Já utilizado" + nome + horário
│   ├── ❌ Vermelho: "Inválido/Cancelado/Outro evento"
│   └── Vibração + som
├── Scanner continua ativo (não para)
├── Botão X para fechar → volta à aba QR
└── Debounce: ignora mesmo QR por 5s
```

## 6. Proposta de Fluxo da Aba Listas

```text
Aba Listas
├── Cards das listas do evento:
│   ├── Nome da lista
│   ├── Pendentes: X
│   ├── Check-ins: Y
│   └── Clique → abre detalhe
└── Detalhe da Lista:
    ├── Título + contadores
    ├── Busca por nome
    ├── Lista de participantes com status
    └── Botão "Entrada" para check-in imediato
```

## 7. Impacto em Dados, Hooks, Queries e Tabelas

### Tabelas — sem alteração de schema
- `tickets`, `event_lots`, `guest_lists`, `guest_list_entries` — já suficientes
- `checkin_logs` — já existe, precisa ser populado pelo edge function na validação

### Edge Functions
- `collaborator-validate-ticket` — adicionar inserção em `checkin_logs` com `source` (scanner_qr | busca_manual) e `collaborator_id`
- `collaborator-validate-guest-entry` — adicionar inserção em `checkin_logs` com `source` (lista) e `collaborator_id`

### Hooks — não há hooks dedicados ao colaborador hoje; queries são feitas diretamente nos componentes. Manter essa abordagem simples.

## 8. Plano de Implementação em Blocos

### Bloco 1: Tela de Eventos do Colaborador
- Criar `ColaboradorEventos.tsx` com abas Próximos/Passados
- Cards com imagem, nome, data, hora, status, botão "Fazer Check-in"
- Atualizar rota no App.tsx

### Bloco 2: Tela Operacional com Bottom Nav
- Criar `ColaboradorEvento.tsx` com header (nome, data, indicadores)
- Bottom nav fixa com 2 abas: QR Code e Listas
- Componentes `ColaboradorBottomNav`, `ColaboradorQRTab`, `ColaboradorListasTab`
- Remover rotas antigas (scanner, participantes, convidados)

### Bloco 3: Fullscreen Scanner QR Contínuo
- Criar `ColaboradorQRScanner.tsx` — fullscreen, câmera imediata
- Validação automática ao scan (action=validate direto)
- Overlay de resultado sem parar scanner
- Debounce de 5s por código
- Vibração no feedback

### Bloco 4: Busca Manual
- Na aba QR, campo de busca por código/nome/email/telefone
- Resultados com botão "Check-in" direto
- Usa edge function existente

### Bloco 5: Aba Listas e Detalhe
- Cards de listas com contadores
- Tela de detalhe com busca e botão "Entrada"
- Usa edge function `collaborator-validate-guest-entry`

### Bloco 6: Logs de Check-in e Ajustes
- Atualizar edge functions para inserir em `checkin_logs` com `collaborator_id` e `source`
- Ajustes visuais finais e feedback

## 9. Riscos Técnicos

1. **Scanner contínuo**: html5-qrcode para e reinicia por design; precisaremos de debounce em vez de stop/restart
2. **RLS em tickets**: colaborador não é autenticado via Supabase Auth — queries diretas ao banco precisam passar pela edge function (já é assim)
3. **Checkin_logs RLS**: insert policy atual exige ser producer — precisará de ajuste para permitir insert via service_role na edge function (já usa service_role, sem problema)

## 10. Proposta Exata da Primeira Versão (Bloco 1)

Criar `src/pages/colaborador/ColaboradorEventos.tsx`:
- Header com nome do colaborador e botão logout
- Abas "Próximos" e "Passados" (filtro por `event.date >= hoje`)
- Cards de evento com: imagem, título, data formatada, hora, badge de status, botão "Fazer Check-in"
- Clique no botão navega para `/colaborador/evento/:id`

Atualizar `src/App.tsx`:
- Trocar rota `/colaborador/dashboard` para `/colaborador/eventos`
- Atualizar redirect no login

### Arquivos impactados no Bloco 1
| Arquivo | Ação |
|---|---|
| `src/pages/colaborador/ColaboradorEventos.tsx` | Criar |
| `src/App.tsx` | Atualizar rota |
| `src/pages/colaborador/ColaboradorLogin.tsx` | Redirect para `/colaborador/eventos` |

