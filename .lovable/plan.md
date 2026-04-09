

# Aumentar Logo no Header

A logo está com `h-10 md:h-12` (40px mobile / 48px desktop) — muito pequena para a barra de navegação.

## Alteração

**`src/components/Header.tsx` linha 51:**
- De: `className="h-10 md:h-12 w-auto"`
- Para: `className="h-14 md:h-16 w-auto"` (56px mobile / 64px desktop)

Isso vai triplicar praticamente a área visual da logo, mantendo proporção automática com `w-auto`.

Um único arquivo alterado, zero risco.

