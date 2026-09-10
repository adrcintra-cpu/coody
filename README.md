# COODY

Workspace criativo de agência. Etapa 1 funcional com dados fictícios, persistência D1, arquivos R2 e interface em português.

## Implementação por etapas

1. **Base e experiência (implementada):** arquitetura TypeScript modular, design system dark com logo oficial, Krona One e Saira locais, Dashboard, Brand Spaces, Biblioteca, Planejamento, Calendário, Conteúdos, Studio, Aprovações e telas de preparação das integrações.
2. **IA:** conectar adaptador OpenAI somente no servidor; geração de texto e imagem separadas, validação de 5 hashtags, contexto completo da marca, recuperação de referências e recomposição independente de Feed e Story.
3. **Trello:** configuração de workspace/board/listas, cards com anexos, webhooks assinados, sincronização idempotente, comentários e fila de tentativas.
4. **Equipes:** identidade por usuário, autorização real por papel e agência, convites, aprovação externa por link, auditoria e limites de upload/geração.
5. **Operação:** paginação, busca contextual, políticas de retenção, observabilidade e futuros canais de publicação.

## Estrutura

- `app/`: documento, rota principal e APIs do servidor.
- `components/coody/`: módulos de produto, formulários, componentes compartilhados e shell.
- `components/ui/`: componentes acessíveis instalados com o starter.
- `lib/types.ts`: entidades e status.
- `lib/domain.ts`: distribuição editorial, datas, semelhança e regras de aprovação.
- `lib/repository.ts`: acesso D1/R2 e seed demonstrativo idempotente.
- `lib/services.ts`: interfaces OpenAIService, TrelloService, StorageService e construtor de Brand Context.
- `db/schema.ts` e `drizzle/`: modelo relacional e migração inicial.
- `tests/domain.test.mjs`: regras editoriais e fluxo de status.
- `public/`: arquivos oficiais do logo copiados sem alteração e fontes locais.

A `FERRAMENTAS/landingbase` foi lida e preservada. É um starter Astro estático; o aplicativo utiliza o starter Sites/Vinext com React/TypeScript para suportar interações, banco e arquivos. Os fontes finais ficam nesta pasta `COODY/app`.

## Funcionalidades da etapa 1

- Cadastro/edição de marcas, identidade, tom de voz, regras, produtos/serviços textuais e distribuição de pilares validada em 100%.
- Upload de PDF, SVG simples, PNG, JPG e WEBP (20 MB), vínculo com marca, categorias, prioridade e referência aprovada. Bytes no R2; referências no D1. SVG ativo é rejeitado.
- Planejamento por regras explicitamente demonstrativo. Completa a meta mensal considerando conteúdos existentes, dias preferidos, pilares e datas selecionadas. Não chama IA. Pautas podem ser editadas, movidas pela data ou excluídas antes da criação.
- Calendário mensal, semanal e lista, filtros de marca/status e criação por data.
- Studio com textos editáveis, seleção independente de Feed e Story, cinco hashtags, versões imutáveis por acréscimo, comparação e comentários. Sem geração de imagem simulada.
- Fluxo Ideia → Planejado/Em criação → Revisão → Aprovação → Alteração/Aprovado → Publicado. Aprovação requer textos, 5 hashtags e os arquivos dos formatos escolhidos. A versão aprovada é bloqueada pelo servidor.
- Aprovação pode promover artes à biblioteca da marca. Publicação é uma marcação manual, sem postagem nas redes.

## Persistência e modelo

17 tabelas cobrem users, brands, brand_assets, brand_guidelines, products, services, content_pillars, special_dates, monthly_plans, content_items, content_versions, generated_assets, approvals, trello_integrations, trello_cards, comments e activity_logs. Chaves estrangeiras relacionam entidades e índices atendem marca/data, ativos e versão única.

Nesta etapa, a ficha editável da marca é a fonte de verdade para pilares, produtos, serviços e regras; as tabelas dedicadas ficam reservadas à normalização nas próximas etapas. Isso evita duas fontes editáveis divergentes. O usuário demonstrativo é único; os papéis são contratos preparados, ainda não autorização multiusuário. O site deve permanecer privado ao proprietário até a etapa de identidade e permissões.

## Desenvolvimento

Requer Node >=22.13 e pnpm. `pnpm install`, `pnpm dev`, `pnpm exec tsc --noEmit`, `node --experimental-strip-types --test tests/domain.test.mjs`, `pnpm build`. Gere mudanças de schema com `pnpm db:generate`. A migração inicial deve ser aplicada à instância D1 local antes do primeiro uso. Sites aplica as migrações na publicação. O seed fictício é inserido uma única vez após a estrutura existir.

As fontes são servidas localmente. As licenças OFL estão em `public/fonts/`.

## Limites intencionais

OpenAI/Trello sem credenciais ou chamadas reais. Arquivos são anexados manualmente e não há editor gráfico ou renderização automática de artes. A integração WebMCP opcional apenas abre o formulário; não foi validada em um contexto WebMCP compatível. Não houve teste visual automatizado de navegador. API, regras de domínio, tipos e build são validados separadamente.
