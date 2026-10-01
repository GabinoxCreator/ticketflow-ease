# AGENTS.md — Technical rules

- Root `deno.json` sets `"nodeModulesDir": "auto"` — Deno 2.6 `deno check` (BYONM/manual mode) cannot resolve untyped CJS npm packages like `npm:bcryptjs@2.4.3`; auto mode fixes TS2307 across all edge functions. Do not delete this file.
- Edge-function typecheck sweep note: `deno check` flags ~7 functions with pre-existing strictness errors (has_role rpc typing, `getUserByEmail`, mixed supabase-js versions in collaborator-confirm-payment, cast-through-unknown in close/reopen-table-manual, SessionValidation narrowing in collaborator-create-courtesy). They do NOT fail the harness build — do not "fix" them casually; deployed code depends on current behavior.
