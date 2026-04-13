

# Criar Página de Política de Privacidade

## Resumo
Criar uma nova página `/privacidade` com o conteúdo completo da Política de Privacidade da FestPag, usando o mesmo layout (Header + Footer) das páginas públicas. O link já existe no Footer apontando para `/privacidade`.

## Mudanças

### 1. Criar `src/pages/PoliticaPrivacidade.tsx`
- Página pública com Header, Footer e conteúdo da política
- Layout com `container` centralizado, tipografia limpa e legível
- Todas as 14 seções do documento formatadas com headings (`h2`), parágrafos e listas (`ul/li`)
- Data de última atualização destacada no topo
- E-mail de contato como link `mailto:`

### 2. Atualizar `src/App.tsx`
- Adicionar rota `/privacidade` apontando para `PoliticaPrivacidade`

## Arquivos impactados
| Arquivo | Ação |
|---|---|
| `src/pages/PoliticaPrivacidade.tsx` | Criar |
| `src/App.tsx` | Adicionar rota |

