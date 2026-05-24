# Corrigir logout aleatório do colaborador

## Problema

Toda vez que o colaborador lê um QR code, abre a aba de check-in ou alterna telas, é deslogado e precisa fazer login de novo. Causa: a validação de sessão nas Edge Functions usa `bcrypt.compareSync` (WASM síncrono), que **lança exceção intermitentemente no Deno** sob requisições próximas. Hoje qualquer exceção é tratada como `session_expired: true`, e o front-end limpa o localStorage e manda pro login.

## Solução

### 1. Trocar bcrypt por SHA-256 nos tokens de sessão
O token já é um UUID aleatório gerado no servidor — não precisa de bcrypt (que é pra senhas humanas). SHA-256 nativo do Deno é determinístico, instantâneo e sem WASM. Comparação vira igualdade de string, zero falsos negativos.

- `collaborator-login`: grava `sha256(token)` em `session_token_hash`.
- Compatibilidade: se o hash começa com `$2` (bcrypt antigo), faz fallback com `compareSync` e atualiza pra SHA-256 silenciosamente. Sessões ativas não são derrubadas.

### 2. Não deslogar em erro transitório
Separar os retornos da validação:
- Token ausente / não encontrado / `expires_at` vencido / mismatch real → `session_expired: true` (logout).
- Exceção inesperada → HTTP 500 com `error: 'temporary'` **sem** `session_expired`. Front mostra toast e mantém a sessão.

### 3. Helper compartilhado
Criar `supabase/functions/_shared/collaboratorSession.ts` com `hashToken()` e `validateSession()` e usar em todas as 8 functions de colaborador. Evita copy-paste do bcrypt em cada uma.

## Arquivos

**Novo**
- `supabase/functions/_shared/collaboratorSession.ts`

**Editados (login + grava SHA-256)**
- `supabase/functions/collaborator-login/index.ts`

**Editados (passam a usar o helper)**
- `supabase/functions/collaborator-validate-ticket/index.ts`
- `supabase/functions/collaborator-list-tickets/index.ts`
- `supabase/functions/collaborator-event-stats/index.ts`
- `supabase/functions/collaborator-list-guests/index.ts`
- `supabase/functions/collaborator-validate-guest-entry/index.ts`
- `supabase/functions/collaborator-register-door-sale/index.ts`
- `supabase/functions/collaborator-door-sales-report/index.ts`
- `supabase/functions/collaborator-search-tickets/index.ts`

**Sem mudança**
- Sem migration de schema.
- Sem mudança no `ColaboradorAuthContext` nem em componentes (o contrato `session_expired` continua igual; só passa a ser disparado pelos motivos certos).

## Detalhes técnicos

```ts
// _shared/collaboratorSession.ts
export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function validateSession(supabase, collaboratorId, token):
  Promise<{ valid: boolean; expired?: boolean; transient?: boolean; error?: string }> {
  if (!token) return { valid: false, expired: true, error: 'sem token' };
  const { data, error } = await supabase
    .from('collaborator_sessions')
    .select('session_token_hash, expires_at')
    .eq('collaborator_id', collaboratorId)
    .maybeSingle();
  if (error) return { valid: false, transient: true, error: error.message };
  if (!data) return { valid: false, expired: true, error: 'sessão não encontrada' };
  if (new Date(data.expires_at) < new Date()) return { valid: false, expired: true };

  const stored = data.session_token_hash;
  // novo formato (SHA-256 hex, 64 chars)
  if (/^[0-9a-f]{64}$/.test(stored)) {
    return stored === await hashToken(token)
      ? { valid: true }
      : { valid: false, expired: true, error: 'token inválido' };
  }
  // fallback bcrypt + auto-upgrade
  try {
    const { compareSync } = await import("https://deno.land/x/bcrypt@v0.4.1/mod.ts");
    if (compareSync(token, stored)) {
      const newHash = await hashToken(token);
      await supabase.from('collaborator_sessions')
        .update({ session_token_hash: newHash })
        .eq('collaborator_id', collaboratorId);
      return { valid: true };
    }
    return { valid: false, expired: true, error: 'token inválido' };
  } catch {
    return { valid: false, transient: true, error: 'erro ao verificar' };
  }
}
```

Nas functions, o tratamento vira:
```ts
const sv = await validateSession(supabase, collaboratorId, token);
if (!sv.valid) {
  if (sv.transient) return json({ error: 'temporary' }, 500);   // não desloga
  return json({ error: sv.error, session_expired: true }, 401); // desloga
}
```

## Validação

1. Logar como colaborador, abrir aba de check-in: deve carregar sem logout.
2. Ler vários QRs em sequência rápida: nenhum logout.
3. Trocar de aba (Listas → QR → Listas): sessão mantida.
4. Logs antigos com bcrypt: primeiro request faz upgrade transparente e segue funcionando.
