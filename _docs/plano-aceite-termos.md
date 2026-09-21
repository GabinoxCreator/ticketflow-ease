# Plano — o aceite dos termos passa a existir e a ficar guardado

> Nasceu da dúvida do Gabriel em 21/09/2026: *"no site a gente não tem contrato com o produtor,
> ele só dá o aceite ali e cria o evento — a gente está dentro das regras?"*
> A investigação do mesmo dia achou o retrato completo; este plano conserta a parte que é código.

## O que a investigação achou (o porquê deste plano)

| | Hoje |
|---|---|
| Termos de Uso, Privacidade, Reembolso | ✅ existem, no ar, e são bons — dizem que o produtor responde pelo evento |
| Produtor aceita? | ✅ caixa obrigatória no cadastro — ❌ **não é gravada em lugar nenhum** |
| Comprador aceita? | ❌ **nada**, nem no cadastro nem no checkout (regressão da virada de login de 09-10/09) |
| Prova de quem aceitou o quê, e quando | ❌ não existe |

Sympla e Shotgun também **não** assinam contrato com produtor: o modelo delas é o aceite por
clique. Ele vale juridicamente no Brasil **desde que haja prova** — data, versão do documento e,
de preferência, IP. É essa prova que estamos construindo aqui.

## Decisões do Gabriel (21/09)

1. **Comprador:** aviso de texto embaixo do botão, **sem caixa para marcar**. Zero atrito na venda.
2. **Tela de condições ao publicar evento:** fica para depois (continua na Fila).
3. **Exigir CPF/CNPJ do produtor antes do repasse:** fica para depois (continua na Fila).
4. **[CONSULTAR ADVOGADO]** — fora deste plano: a cláusula que obriga o produtor a nos ressarcir
   o reembolso que pagamos por conta dele, e o percentual/prazo de repasse nos Termos.

## Princípio que rege tudo aqui

**O aceite é gravado pelo SERVIDOR, nunca pelo navegador.** Aceite que o front grava é aceite que
qualquer um forja — e um registro forjável não serve de prova, que é justamente o ponto do
trabalho. Onde o servidor não vê o pedido (cadastro do produtor, que vai direto ao Supabase), quem
grava é o gatilho do banco, a partir dos dados que vieram no cadastro.

---

## Bloco 0 — Onde o aceite mora

**Tabela nova `aceites_legais`** (migration):

| coluna | o que é |
|---|---|
| `id` | uuid |
| `usuario_id` | quem aceitou (`auth.users`) |
| `documento` | `termos` · `privacidade` · `reembolso` |
| `versao` | a data do documento aceito (ex.: `2026-04-14`) — muda quando o texto muda |
| `aceito_em` | carimbo do servidor, nunca do navegador |
| `contexto` | `cadastro_cliente` · `cadastro_produtor` · `checkout` |
| `ip`, `navegador` | quando disponíveis (o gatilho do banco não enxerga) |
| `pedido_id` | só no aceite de checkout |

- **RLS:** o titular lê os dele; **ninguém escreve pela chave pública** — só service role e o gatilho.
- **Não apaga, não atualiza:** é registro histórico. Documento novo = linha nova.

**Fonte única de versões** — `src/lib/documentos-legais.ts`: um lugar só com a data de cada
documento e os textos de aviso. As três páginas legais passam a ler a data daqui (hoje cada uma
tem a data escrita à mão no meio do arquivo, e é fácil trocar o texto e esquecer a data).

## Bloco 1 — Produtor: gravar o aceite que já existe

A caixa já está lá e já trava o botão. Só não chega ao banco.

1. `ProducerSignupWizard` passa as versões aceitas no cadastro.
2. `AuthContext.signUp` repassa ao Supabase (hoje ele corta o campo).
3. O gatilho `handle_new_user` grava as linhas em `aceites_legais`.

**Nada muda na tela.** Quem já tem conta não é afetado — e é bom que fique claro: **este plano não
inventa aceite para quem já se cadastrou**. Aceite retroativo seria mentira.

## Bloco 2 — Comprador: o aviso aparece e o aceite é gravado

1. **Cadastro** (`FluxoConta`, tela da senha): abaixo de "Criar minha conta" —
   *"Ao criar a conta, você concorda com os Termos de Uso e a Política de Privacidade."*, com links.
2. **Checkout** (botão de pagar): *"Ao concluir a compra, você concorda com os Termos de Uso e a
   Política de Reembolso."* — o reembolso entra aqui porque é o documento que fixa prazo e regra
   de devolução, e é na compra que ele passa a valer.
3. A gravação é no servidor: a função que cria a conta (`auth-codigo`) e a que fecha o pedido
   gravam o aceite com IP.

## Bloco 3 — Os textos que estão vencidos

Não é reescrever política: é parar de dizer coisa que não é mais verdade.

- **Política de Privacidade:** hoje diz que quem processa pagamento e repasse é o **Mercado Pago** —
  é a **Safe2Pay** (rota do Marcel) desde agosto. Falta também dizer que o produtor pode receber o
  **CPF** do comprador (o painel dele mostra), e **não há uma linha sobre biometria facial**, que
  está no ar e é dado sensível.
- **Central de Ajuda:** diz que não existe transferência de ingresso (existe desde 19/08) e crava a
  taxa em 10% (o sistema permite taxa diferente por produtor e por evento).
- ⚠️ **Mudança de texto legal vai com diff na tela para o Gabriel aprovar antes do commit.**

---

## Ordem de subida (quando o maestro for subir)

1. migration da tabela → 2. redeploy das funções que gravam → 3. publish do site.
Fora dessa ordem, o site tentaria gravar numa tabela que ainda não existe.

## Como voltar atrás

Reverter o commit desfaz as telas. A tabela pode ficar: ela só guarda registro, não é lida por
nenhum fluxo de venda. Se for preciso, `drop table aceites_legais` — nada mais depende dela.

## O que este plano NÃO resolve (continua na Fila)

- A cláusula de regresso contra o produtor — **é a que protege dinheiro** e depende de advogado.
- Taxa e prazo de repasse escritos nos Termos.
- Aceite por evento na publicação, e documento obrigatório antes do repasse.
- Meia-entrada, que o site não oferece (a obrigação é do produtor, mas alguém vai perguntar).
