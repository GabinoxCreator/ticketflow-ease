## Melhorar UX da aba Listas (Colaborador)

### O que muda
Hoje cada convidado aparece num card com um botão "Entrada" à direita. Vamos transformar o card inteiro (com o nome) em um item clicável que abre um modal com os detalhes do convidado e o botão de check-in dentro do modal.

### 1. Card do convidado (lista)
- Remover o botão "Entrada" do card.
- O card inteiro vira clicável (`button` acessível) → abre o modal.
- Mantém: nome, badge de status (Pendente / Entrou) e horário do check-in quando já entrou.
- Convidados que já fizeram check-in continuam clicáveis (para conferir o horário), mas o modal mostra estado "Já entrou" em vez do botão de confirmar.

### 2. Aviso fixo antes da lista
Logo acima da busca/lista, adicionar um bloco de atenção em tom âmbar com ícone de alerta:

> **Como confirmar o nome na lista**  
> Peça o nome completo ao convidado, localize na lista abaixo, toque no nome para abrir os detalhes e confirme o check-in. Confira sempre o nome antes de liberar a entrada.

### 3. Modal de detalhes do convidado
- Abre ao clicar no card. Fecha clicando no X, clicando fora ou com ESC (comportamento padrão do Dialog do shadcn).
- Conteúdo:
  - Nome do convidado (destaque)
  - Status atual (Pendente / Entrou)
  - Lista a que pertence (nome da lista)
  - "Inscrito em": data/hora do `created_at`
  - "Origem": "Inscrição pública" (added_by=public) ou "Adicionado pelo produtor" (added_by=producer)
  - Se já entrou: "Check-in em": data/hora do `checked_in_at`
- Rodapé:
  - Pendente → botão grande **Confirmar check-in** (verde, full-width)
  - Já entrou → mensagem "Convidado já liberado" + botão "Fechar"

### 4. Observação sobre telefone/email
A tabela `guest_list_entries` hoje guarda apenas `name`, `added_by`, `status`, `checked_in_at`, `created_at`. Não há telefone/email coletados. O modal vai exibir só o que existe (nome, origem, data de inscrição, status). Não vou alterar o schema neste passo — se quiser passar a coletar telefone/email no formulário público, abrimos isso depois como tarefa separada.

### Arquivos afetados
- `src/components/colaborador/ColaboradorListaDetalhe.tsx` — remove botão inline, adiciona aviso, abre modal ao clicar no nome, move ação de check-in para dentro do modal.
- (sem mudanças em hooks, edge functions ou banco)

### Fora do escopo
- Não muda o fluxo de validação no backend (`collaborator-validate-guest-entry`).
- Não altera schema do banco.
- Não muda outras abas (Check-in QR, Vender, Relatórios).