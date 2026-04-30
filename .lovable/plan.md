## Objetivo

Melhorar a experiência dos emails OTP (verificação de checkout e redefinição de senha) em duas frentes:

1. **Topo do email**: substituir o título textual "FestPag" pela logo oficial da marca.
2. **Início do conteúdo + notificação push**: mover o bloco do código de 6 dígitos para o topo (logo abaixo da logo) e incluir o código no `subject` + preheader, para que o usuário consiga ler o código direto na notificação push do celular, sem precisar abrir o email.

## Mudanças

### 1. `supabase/functions/send-password-reset-code/index.ts`
- **Subject**: `"Código para redefinir sua senha - FestPag"` → `"205293 é o seu código para redefinir a senha - FestPag"` (código dinâmico no início).
- Adicionar **preheader oculto** (`display:none`) com `Seu código FestPag: {code} (expira em 10 minutos)` — esse texto é o que aparece na prévia do inbox / push notification.
- Substituir `<h1>FestPag</h1>` por `<img src="https://festpag.com.br/logo-festpag.png" width="160" alt="FestPag" />`.
- Mover o **bloco roxo do código** para logo abaixo da logo (antes do título "Redefinição de senha").
- Adicionar pequeno label "SEU CÓDIGO" acima dos dígitos para reforçar contexto.

### 2. `supabase/functions/send-verification-code/index.ts`
Mesma reformulação aplicada ao email de verificação de checkout:
- Subject: `"{code} é o seu código de verificação - FestPag"`.
- Preheader oculto com o código.
- Logo no topo (mesma URL pública).
- Bloco do código movido para o topo, antes do "Olá, {name}!".

## Detalhes técnicos

- A logo será carregada da URL pública **`https://festpag.com.br/logo-festpag.png`** (já existe em `public/logo-festpag.png` e o domínio está ativo). Imagens em emails precisam ser hospedadas em URL pública — não é possível embutir do `src/assets`.
- O **preheader** é uma técnica padrão de email: um `<div>` com `display:none; opacity:0; max-height:0` que clientes de email (Gmail, Apple Mail, etc.) usam como texto de prévia na lista de mensagens e em notificações push.
- O background do email continua **branco (#ffffff)** — boa prática para deliverability e leitura, independente do tema escuro do app.
- O resto do conteúdo (mensagem, aviso de expiração, "se não foi você"), footer e rodapé permanecem iguais.

## Resultado esperado na notificação push

Antes: `Código para redefinir sua senha - FestPag — Recebemos uma solicitação...`
Depois: `205293 é o seu código para redefinir a senha - FestPag — Seu código FestPag: 205293 (expira em 10 minutos)`

Posso prosseguir?
