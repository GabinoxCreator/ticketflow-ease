
# Criar Página de Termos de Uso

## Resumo
Criar a página `/termos` com o conteúdo completo dos Termos de Uso, seguindo o mesmo layout da Política de Privacidade (Header + Footer, container centralizado, tipografia limpa).

## Mudanças

### 1. Criar `src/pages/TermosDeUso.tsx`
- Mesmo layout de `PoliticaPrivacidade.tsx` (Header, Footer, container `max-w-3xl`, `react-helmet-async`)
- Todas as 18 seções formatadas com `h2`, parágrafos e listas
- Data de última atualização: 14 de abril de 2026
- Links `mailto:contato.festpag@gmail.com`

### 2. Atualizar `src/App.tsx`
- Importar `TermosDeUso` e adicionar rota `/termos`

### 3. Atualizar `src/components/Footer.tsx`
- Consolidar os links duplicados: remover `/termos-servico` da seção Legal (redundante) e manter `/termos` na seção Suporte como link principal dos Termos de Uso

## Observação sobre conteúdo
O texto menciona 4 pontos a definir internamente (política de reembolso detalhada, transferência de ingressos, taxa de serviço, regras de repasse). Esses pontos estão redigidos de forma genérica no documento, o que é adequado para uma primeira versão. Quando vocês definirem essas regras, basta atualizar o texto.

## Arquivos impactados
| Arquivo | Ação |
|---|---|
| `src/pages/TermosDeUso.tsx` | Criar |
| `src/App.tsx` | Adicionar rota `/termos` |
| `src/components/Footer.tsx` | Consolidar links duplicados |
