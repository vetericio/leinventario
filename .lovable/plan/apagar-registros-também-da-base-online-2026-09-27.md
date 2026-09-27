# Apagar registros também da base online

## Alterações
- Ao tocar na lixeira de uma linha já sincronizada, apagar o mesmo registro da base online pelo seu número sequencial.
- Remover a linha da tela e do aparelho somente depois que a exclusão online for confirmada, evitando que ela reapareça na próxima sincronização.
- Para registros ainda não enviados, apagar apenas do aparelho, pois eles ainda não existem na base online.
- Ao confirmar **Apagar Planilha**, excluir todos os registros da base online e, após a confirmação, limpar a lista do aparelho.
- Se estiver sem internet ou a exclusão falhar, manter os registros e mostrar uma mensagem clara para tentar novamente.
- Bloquear ações repetidas enquanto a exclusão estiver em andamento e exibir o estado de processamento.

## Verificação
- Apagar uma linha sincronizada e confirmar que ela não volta após atualizar a base.
- Apagar uma linha pendente e confirmar que ela some apenas do aparelho.
- Usar **Apagar Planilha** e confirmar que a base inteira e a lista local ficam vazias em todos os aparelhos após sincronizar.
- Simular falha de conexão e confirmar que nenhum registro desaparece apenas da tela sem ter sido apagado online.

## Detalhes técnicos
- Usar o identificador `onlineSequence` para a exclusão individual.
- Usar uma requisição de exclusão de todos os registros para a limpeza completa.
- Validar a resposta da base antes de atualizar o armazenamento local.
