# Ajustes de Layout - Leinventário

## Objetivo
Aplicar três mudanças visuais simples no app.

## Tarefas

1. **Estatísticas lado a lado em qualquer tela**
   - Remover a regra de media query que empilha os cards de estatísticas em telas estreitas (`@media (max-width: 640px) { .stats-bar { grid-template-columns: 1fr; } }`).
   - Manter `.stats-bar` com `grid-template-columns: 1fr 1fr` também no mobile.

2. **Esconder a seção "Instalar App" quando o app já estiver instalado**
   - No `App.tsx`, renderizar o `<footer className="app-footer">` apenas quando `isInstalled` for `false`.
   - Quando instalado, toda a área de instalação (card + ajuda manual) desaparece.

3. **Adicionar créditos no rodapé final**
   - Inserir, no final do container principal, um texto centralizado:
     `Feito por Veterício Tech - 31995512795`.
   - Aplicar estilo discreto (fonte pequena, cor secundária) via `App.css`.

## Arquivos alterados
- `src/App.tsx`
- `src/App.css`
