# Reteste após correções

Os resultados abaixo atualizam o parecer da versão 4, preservado em parecer-entrega.md.

- Aprovação concorrente: controle de revisão por pauta, conferência da revisão da interface e guarda atômica no banco. Um conflito interrompe toda a transação. Três rodadas de aprovação versus alteração passaram: uma resposta 200 e uma 409, sem bloqueio, comentário ou referência indevidos.
- Datas: vínculo obrigatório por marca nas novas datas próprias; validação no planejamento e no servidor. Datas antigas sem vínculo são preservadas e podem ser associadas pelo gerenciamento do Planejamento global. Apenas as duas datas demonstrativas conhecidas e datas explicitamente globais continuam compartilhadas.
- Planejamento: revisão de metas, dias, campanha e seleção de datas, preservando todas as pautas. Confirmado por API e interface.
- Mobile: largura do documento corrigida de 550 para 390 px no teste com viewport 390 px. As cinco abas permanecem acessíveis.
- Cadastro: Escape/fechamento e Cancelar pedem confirmação quando há preenchimento; continuar preserva os valores. Confirmado no navegador. O navegador também recebe proteção contra sair/recarregar com rascunho.
- Upload: validação estrutural no servidor rejeita arquivos truncados; a interface verifica decodificação das imagens antes de enviar. Isso não substitui varredura antimalware ou validação exaustiva dos formatos.
- Navegação: marca, aba, conteúdo e mês incluídos no endereço; restauração de marca/aba verificada após atualização.
- Mês inicial: usa o mês corrente em America/Sao_Paulo.
- Brand Context: exclui a própria pauta do histórico.
- Títulos: Krona One, peso real 400, sem negrito sintético. O arquivo foi copiado de Library/Fonts/KronaOne-Regular.ttf fornecido pelo usuário. Não há arquivo Light disponível e nenhum peso Light foi inventado.

Contas, permissões por papel, OpenAI, Trello, teste de carga e restauração operacional permanecem fora desta correção. O site continua privado. Os bloqueadores funcionais corrigidos não equivalem a homologação de operação multiusuário.
