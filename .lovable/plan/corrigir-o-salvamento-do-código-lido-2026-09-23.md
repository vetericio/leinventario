# Corrigir o salvamento do código lido

## Problema confirmado
O botão **Salvar** só fica disponível quando usuário, área com exatamente 4 caracteres e lote com exatamente 10 caracteres estão preenchidos. Quando alguma condição falta, a tela apenas bloqueia o botão, sem informar claramente o que precisa ser corrigido.

## Alterações
- Exibir, junto ao formulário da leitura, qual informação está faltando ou inválida.
- Manter o botão de salvar acionável e, ao tocá-lo com dados incompletos, destacar os campos que precisam de correção.
- Salvar primeiro no aparelho e mostrar uma confirmação visível assim que o registro entrar no inventário.
- Manter o envio para a base online como etapa separada: uma falha de conexão não impedirá nem apagará o registro salvo no aparelho.
- Preservar os requisitos atuais: usuário selecionado, área com 4 caracteres e lote com 10 caracteres.

## Verificação
- Testar salvamento com todos os campos corretos.
- Testar cada campo obrigatório ausente e confirmar a mensagem correspondente.
- Testar sem conexão e confirmar que o registro permanece no inventário como pendente.
- Reabrir a página e confirmar que o registro salvo no aparelho continua disponível.
