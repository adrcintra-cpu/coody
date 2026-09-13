# Trello — conexão e envio manual

Conexão da conta com chave/token validados em members/me; criptografia AES-GCM com chave mantida como segredo do servidor. Nenhuma credencial é retornada ao navegador após salvar. Seleção de quadro acessível e três listas distintas. Cada versão de conteúdo em aprovação recebe um card separado; artes privadas são enviadas como anexos binários de até 10 MB. Reserva persistente e identificação por versão permitem recuperar criação ambígua sem recriar card automaticamente. Envios incompletos podem ser retomados pelo mesmo botão. Se não for possível localizar com certeza um card após falha de rede, o envio fica bloqueado para revisão administrativa.

Escopo: envio manual COODY → Trello. Listas de alteração/aprovado ficam configuradas; importação de decisões e comentários, webhooks e sincronização automática ainda não implementados. Não anunciar bidirecionalidade.

Validação: 24 testes unitários aprovados, incluindo criptografia com IV aleatório, detecção de adulteração, validação de credenciais, credenciais somente no cabeçalho e mensagens de erro sem tokens; testes locais da API confirmam 401 anônimo, estado desconectado verdadeiro, credenciais inválidas recusadas, envio sem conexão recusado e origem externa bloqueada. Interface de autorização conferida no navegador. Nenhuma chamada de escrita foi executada na conta real Trello: autorização ainda pendente, portanto criação e anexação reais não estão homologadas.

Quadro solicitado: https://trello.com/b/nvUBy791/meu-quadro-do-trello
Referência de autorização: https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
