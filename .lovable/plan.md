# Aumentar limite de caracteres do título do evento

## Problema

O título "Lançamento Audiovisual Feliz no Simples Miguel Lourenço + Samba dos Pretos + Grupo Sem Querer + Seu Moço" tem ~107 caracteres. O schema em `src/pages/EditarEvento.tsx` (linha 51) limita o título a 100, então qualquer edição/salvamento bloqueia com `String must contain at most 100 character(s)`.

O `CriarEvento.tsx` não tem esse limite (só valida `min 3`), por isso foi possível criar.

## Correção

`src/pages/EditarEvento.tsx` linha 51:

```ts
title: z.string()
  .min(3, 'O título deve ter pelo menos 3 caracteres')
  .max(150, 'O título deve ter no máximo 150 caracteres'),
```

Subir limite para **150** cobre títulos longos com line-up sem virar abuso.

## O que NÃO muda

- Banco (campo `text`, sem constraint).
- `CriarEvento.tsx` (sem limite hoje, manter).
- Demais validações.

## Arquivos tocados

- `src/pages/EditarEvento.tsx` (1 linha)
