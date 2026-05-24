## Problema

A tela do colaborador mostra **"rate_limited"** porque a função `collaborator-login` bloqueia após **5 tentativas em 15 minutos por usuário** (e 20 por IP). Dois fatores combinados causaram isso:

1. O bug antigo (já corrigido) de sessão expirando à toa fez o app refazer login várias vezes em sequência → estourou o limite.
2. A mensagem que aparece ao usuário é o código cru do backend (`rate_limited`), porque o `ColaboradorAuthContext` repassa `data.error` direto pro toast/alert sem traduzir.

## Solução

### 1. Traduzir as mensagens de erro no front (`ColaboradorAuthContext.tsx`)

Mapear os códigos retornados pela edge function para frases amigáveis em PT-BR, usando o `retry_after_seconds` quando disponível:

- `rate_limited` → "Muitas tentativas de login. Tente novamente em X minutos."
- `rate_limit_unavailable` → "Serviço de login indisponível no momento. Tente novamente em instantes."
- Demais erros → manter `data.error` como fallback.

### 2. Não consumir o rate-limit em logins bem-sucedidos (`collaborator-login/index.ts`)

Hoje toda chamada (certa ou errada) incrementa o contador. Vou trocar para incrementar **só quando a senha falhar** (ou usuário não existir). Logins corretos não contam mais para o limite.

Implementação: substituir as duas chamadas `checkRateLimit` no início por uma função `consumeFailedAttempt` chamada apenas no caminho de falha (usuário inexistente, sem credenciais ou senha inválida). Antes disso, fazer um `peek` que só **bloqueia** se já estiver bloqueado — sem incrementar.

Como o `check_rate_limit` RPC sempre incrementa, vou usar duas estratégias:
- **Peek**: uma consulta direta em `auth_rate_limits` para ver se o bucket está em `blocked_until > now()`. Se sim, devolve `rate_limited`.
- **Consume**: chamar `check_rate_limit` no caminho de falha.

Isso preserva proteção contra brute-force, mas usuários legítimos não ficam travados por refazer login.

### 3. Aumentar o teto e a granularidade

Subir de **5/15min** para **10/15min por usuário** e manter **20/15min por IP**. Combinado com o item 2, dá margem suficiente para uso real (operador errar a senha algumas vezes em campo) sem deixar brute-force passar.

### 4. Limpar o lockout atual

A usuária `jeni.made` está bloqueada agora. Vou apagar a linha dela em `auth_rate_limits` via migration pontual (DELETE WHERE bucket LIKE 'login:user:jeni.made%' OR bucket LIKE 'login:ip:%' com filtro de tempo recente — restrito).

## Arquivos a alterar

- `src/contexts/ColaboradorAuthContext.tsx` — tradução do erro.
- `supabase/functions/collaborator-login/index.ts` — peek antes, consume só em falha, novos limites.
- Migration SQL — limpar `auth_rate_limits` da usuária travada.

## Validação

1. Login correto várias vezes seguidas → não bloqueia mais.
2. 10 senhas erradas em 15 min → bloqueia com mensagem "Muitas tentativas… tente em X minutos".
3. Usuária `jeni.made` consegue logar imediatamente após o deploy.

## Observação

O bug de logout aleatório (causa raiz que disparou as tentativas) já foi corrigido no passo anterior com SHA-256. Esse plano fecha a consequência: a tela de bloqueio.