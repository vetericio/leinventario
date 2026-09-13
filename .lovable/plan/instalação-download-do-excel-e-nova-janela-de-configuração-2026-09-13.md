# Instalação, download do Excel e nova janela de configuração

## O que eu verifiquei

No endereço publicado (leinventario.lovable.app) o app está tecnicamente correto: o arquivo de instalação está válido (sem erros), os ícones 192 e 512 existem no tamanho certo, o modo offline está ativo e o download do Excel funciona (testei e o arquivo baixou).

Ou seja: quando o app é aberto **dentro do editor do Lovable** (a telinha de preview), o navegador bloqueia tanto o convite de instalação quanto downloads. É o cenário mais provável do que você está vendo. Mesmo assim vou tornar as duas coisas à prova de falha.

## 1. Instalação

- Detectar quando o app está sendo aberto dentro de uma janela embutida (preview) e, nesse caso, mostrar um aviso com botão "Abrir em nova aba" — de lá a instalação funciona.
- Quando o navegador não oferece o convite automático, mostrar o passo a passo certo para cada celular:
  - Android/Chrome: Menu (⋮) → "Instalar aplicativo" / "Adicionar à tela inicial"
  - iPhone/Safari: Compartilhar → "Adicionar à Tela de Início"
- Manter o botão "Instalar App" e continuar escondendo o bloco quando o app já estiver instalado.

## 2. Download do Excel

- Se o download direto for bloqueado (janela embutida, navegador do Instagram/WhatsApp etc.), o app abre o arquivo em uma nova aba automaticamente.
- Se ainda assim falhar, aparece uma mensagem clara na tela com um link "Baixar planilha" para tocar manualmente, em vez do aviso genérico de erro.
- Mensagem de erro passa a explicar o motivo provável.

## 3. Configuração das colunas em janela separada

- Sai do bloco da página e vira uma **janela (modal)** aberta pelo botão "Configurar colunas".
- Linguagem simples, em passos:
  1. "Em quantas partes quer dividir o código?" (1, 2 ou 3 partes)
  2. "Quantos caracteres tem cada parte?" (só aparecem os campos das partes escolhidas)
  3. "Quer ignorar caracteres?" (do início / do fim, com explicação "0 = não ignora nada")
  4. "Limpar símbolos como ( ) < >" (opção marcável)
- **Exemplos ilustrados** em cada passo, usando um código de amostra, mostrando visualmente o que vai para cada coluna (ex.: `(01)07898765432105` → Parte A: `0789876543210` / Parte B: `5`), mais o "Exemplo de leitura" ao vivo com o último código lido.
- Botões **Salvar** e **Cancelar**: as mudanças só valem ao salvar; cancelar volta tudo como estava. Confirmação curta "Configuração salva".
- As configurações continuam guardadas no celular, então voltam sozinhas na próxima vez que abrir.

## Detalhes técnicos

- `src/App.tsx`: detecção `window.self !== window.top` e de navegador in-app; fallback `window.open(blobUrl)` + estado `exportError` com link manual no `exportXLSX`; novo estado `configOpen` + rascunho `draftRule` aplicado só no Salvar.
- `src/App.css`: estilos do modal de configuração (reaproveitando `.modal-overlay` / `.modal-card`), blocos de exemplo e passos.
