# Revisão da proposta — Marca como núcleo do COODY

A alteração atende à etapa Marca + Identidade + Biblioteca + Memória visual, preservando o design existente e os dados anteriores.

| Pedido | Resultado |
| --- | --- |
| Cadastro inicial | Cinco etapas com informações, identidade opcional, referências, regras e confirmação; conclusão abre a visão geral da marca. |
| Biblioteca por cliente | Vínculo obrigatório por marca; navegação interna mantém marca fixa e seleção global permite gestão de todas. |
| Arquivos | Seis categorias semânticas, preview de imagens, acesso ao PDF, busca, descrição, notas para IA, prioridade e edição dos metadados. |
| Identidade | Indicador orientativo com logo, cores, fontes, referências, voz e brandbook; não bloqueia uso. |
| Conteúdo e planejamento | Abas da marca reutilizam os módulos existentes com dados filtrados e criação vinculada. |
| Aprovação | A opção de adicionar referências promove os arquivos da marca para Artes aprovadas. |
| Brand Context | Exige brand_id específico, separa regras oficiais e inspiração, prioriza referências e filtra histórico e arquivos pela marca. |
| Dados | Mesmas 17 tabelas; oito colunas adicionadas com valores padrão. Categorias legadas normalizadas na leitura. Regras sincronizadas em brand_guidelines. |

## Verificação

12 testes de domínio/contexto passaram. O fluxo local de conteúdo passou por 24 verificações de criação, upload, revisão, aprovação e planejamento. A verificação adicional confirmou cadastro com arquivos e metadados, repetição sem duplicação, falha sem cadastro parcial, edição isolada por marca, rejeição de upload para “Todas as marcas” e preservação de cadastros anteriores. Tipos, lint e compilação são verificados para publicação.

## Limites desta etapa

A integração OpenAI permanece preparada, sem chamadas reais, conforme solicitado. A classificação organiza o futuro contexto, mas ainda não extrai o conteúdo de PDFs ou avalia imagens por IA. Produtos e serviços continuam textuais na ficha existente. Autorização de equipes é uma etapa posterior; o site permanece privado ao proprietário.

O cadastro aceita até 12 arquivos e 25 MB por envio, com limite de 20 MB por arquivo; mais arquivos podem ser adicionados na biblioteca depois. PDF, SVG simples, PNG, JPG e WEBP seguem as validações já utilizadas. Os registros são salvos em uma transação; uploads não associados são compensados quando ocorre falha. Não houve teste visual automatizado no navegador.
