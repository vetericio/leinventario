# Apagar a sincronização online

## Alterações
- Criar um botão separado chamado **Apagar sincronização online** junto aos controles da base online.
- Ao tocar no botão, abrir uma confirmação clara informando que os registros serão apagados para todos os aparelhos.
- Exigir a palavra **APAGAR** antes de liberar a exclusão, evitando acionamento acidental.
- Enviar a exclusão de todos os registros online e, em seguida, consultar novamente a base para confirmar que ela realmente ficou vazia.
- Somente após essa confirmação, remover da tela e do aparelho os registros que vieram da sincronização online.
- Manter registros locais ainda não enviados, para não perder leituras pendentes.
- Se a exclusão falhar ou ainda houver registros online, manter a lista intacta e mostrar uma mensagem para tentar novamente.
- Bloquear sincronização e exclusões repetidas enquanto o processo estiver em andamento.

## Comportamento da sincronização
- Manter o botão **Sincronizar todos os aparelhos** buscando o estado atual da base online.
- Depois de uma exclusão online confirmada, sincronizar não poderá trazer os registros apagados de volta.

## Verificação
- Confirmar que o novo botão apaga todos os registros online e retira da tela apenas os já sincronizados.
- Confirmar que leituras pendentes continuam no aparelho.
- Tocar em **Sincronizar todos os aparelhos** e confirmar que os itens apagados não reaparecem.
- Simular falha de conexão e confirmar que nenhum item desaparece apenas da tela.

## Detalhes técnicos
- Validar a exclusão com uma nova consulta à base, em vez de confiar somente na resposta da requisição de apagar.
- Reutilizar os estados de processamento e mensagens já existentes para manter a interface consistente.
