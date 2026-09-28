# Corrigir o botão “Apagar sincronização online”

## Correção
- Mostrar o estado **Apagando online...** imediatamente após o toque e impedir novos cliques durante o processo.
- Exibir o erro dentro da própria janela de confirmação, em vez de deixá-lo escondido atrás dela.
- Confirmar quantos registros ainda existem após a tentativa de exclusão.
- Fechar a janela e remover da tela somente os registros já sincronizados quando a base online estiver realmente vazia.
- Preservar as leituras ainda pendentes no aparelho.
- Se a base recusar a exclusão ou continuar com registros, manter tudo na tela e informar claramente o motivo.

## Verificação
- Testar a abertura da confirmação, digitar **APAGAR** e conferir a resposta visual imediata.
- Confirmar que os registros online foram realmente removidos antes de atualizar a lista do aparelho.
- Sincronizar novamente e confirmar que os registros apagados não retornam.
- Simular falha de conexão e confirmar que a mensagem aparece dentro da janela sem apagar dados locais.

## Detalhes técnicos
- Inspecionar a resposta da requisição de exclusão e a consulta de confirmação para identificar se a operação foi recusada ou se apagou zero registros.
- Manter a janela aberta em caso de falha, com uma mensagem acionável e opção de tentar novamente.
