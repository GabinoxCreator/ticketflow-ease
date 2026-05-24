## Problema

No card "Busca manual" (página do colaborador no evento), o `<Input>` herda a cor de texto branca do container pai, então o que é digitado fica invisível sobre o fundo branco/cinza claro.

## Correção

`src/components/colaborador/ColaboradorQRTab.tsx` (linha 225): adicionar `text-slate-900 placeholder:text-slate-400` à className do Input para forçar texto escuro e placeholder legível:

```tsx
className="pl-11 h-12 text-base bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white"
```

Sem outras mudanças.