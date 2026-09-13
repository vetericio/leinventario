# Correções: instalação, ignorar caracteres e exportação

## 1. App não instala

Hoje o app tem o arquivo de manifesto e o ícone, mas falta o "service worker" — sem ele o Chrome/Android nunca oferece a instalação.

- Criar um service worker simples (cache do app para funcionar offline) e registrá-lo ao abrir o app.
- Ajustar o manifesto: gerar ícones separados de 192x192 e 512x512 (o atual é um único arquivo de 460 KB com tamanhos declarados juntos, o que o Chrome frequentemente rejeita), com `purpose` "any" e "maskable" separados.
- O botão "Instalar App" passa a funcionar direto; o texto de ajuda manual continua para iPhone.

## 2. Ignorar caracteres do início ou do fim

Novos campos na "Configuração de Divisão de Colunas":

- "Ignorar N caracteres do início"
- "Ignorar N caracteres do fim"

Aplicados ao código já limpo, antes de dividir em colunas. Valor 0 = não ignora nada. Visível no "Exemplo de Leitura" em tempo real e salvo junto com as outras configurações.

## 3. Exportação: logo e acentos

O arquivo atual é CSV, que não aceita imagem e mostra "ç" errado dependendo do programa.

- Trocar a exportação para um arquivo Excel real (.xlsx), com a logo do Leinventário inserida no topo da planilha.
- Acentos corretos em qualquer programa (Excel, Google Sheets, LibreOffice).
- Cabeçalho com título, data/hora da exportação, colunas formatadas e larguras ajustadas.
- Botão passa a se chamar "Exportar Excel".

## Detalhes técnicos

- `public/sw.js` + registro em `src/main.tsx`; cache-first dos assets estáticos.
- Ícones `public/icon-192.png` e `public/icon-512.png` gerados a partir da logo; `public/manifest.json` atualizado.
- `SplitRule` ganha `ignoreStart` e `ignoreEnd`; `parseCode` corta antes da divisão.
- Nova dependência `exceljs` para gerar o .xlsx com imagem embutida; função `exportCSV` substituída por `exportXLSX`.

## Arquivos alterados
- `src/App.tsx`, `src/App.css`, `src/main.tsx`
- `public/manifest.json`, `public/sw.js`, novos ícones
- `package.json`
