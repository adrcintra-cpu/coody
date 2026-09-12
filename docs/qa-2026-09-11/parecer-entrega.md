# COODY — Parecer de entrega ao cliente

**Data:** 11/09/2026. **Versão avaliada:** 4, revisão 611a64e22cd46b2683e9c6392fbdb88dfa866ef3.

**Decisão: não aprovar para operação real com cliente neste momento.** Pode ser apresentado como demonstração controlada com dados fictícios e escopo explícito. A boa aparência e os testes de fluxo normal não comprovam prontidão operacional.

## Escopo e método

Inspeção da versão publicada no navegador, incluindo Marcas, Biblioteca, Conteúdos e Studio; verificação de responsividade a 390 px; cadastro completo por interface no ambiente local; testes de APIs, erros e decisões simultâneas sobre dados fictícios; revisão do código e da política de acesso do site. A versão publicada não recebeu alterações de dados. Nenhuma correção de produto ou nova publicação foi feita durante esta auditoria.

O cadastro local passou pelas cinco etapas, rejeitou campos obrigatórios vazios, permitiu identidade opcional, salvou regras e abriu a visão geral. Os 12 testes automatizados existentes passaram novamente, assim como o roteiro de 24 verificações do fluxo sequencial e o roteiro adicional de cadastro, metadados, idempotência e isolamento. Os casos adversos abaixo demonstram lacunas nessa cobertura.

## Problemas confirmados

### P1 — 01. Aprovação concorrente produz estado contraditório

**Reprodução:** colocar uma pauta em aprovação e enviar simultaneamente “Aprovado” e “Alteração”, esta com comentário. Ambos retornaram HTTP 200. Resultado persistido: status ALTERAÇÃO, uma versão bloqueada e registros de ambas as decisões. Isso pode ocorrer com duas abas, mesmo antes de haver equipes.

**Impacto:** o sistema confirma ações incompatíveis e pode bloquear a versão que deveria ser alterada, além de promover referências indevidamente.

**Causa:** a atualização condicional de status não condiciona os demais efeitos da transação nem verifica se a linha foi alterada. Referências: `app/api/workspace/route.ts:197`, `components/coody/studio.tsx:79`.

**Aceite:** somente uma decisão vence; a segunda recebe conflito claro. Status, bloqueio, histórico e referências devem corresponder exclusivamente à decisão vencedora. Repetir com duas abas e decisões concorrentes.

### P1 — 02. Datas próprias aparecem no planejamento de outra marca

**Reprodução:** cadastrar data fictícia associando a marca QA. A API salva apenas nome, data, segmentos e relevância, sem brandId. “QA aniversário exclusivo da marca de teste” apareceu no planejamento da Forma, confirmado no navegador.

**Impacto:** quebra a regra central de separar o contexto de cada cliente e permite pautas baseadas em eventos de outra marca. Não é evidência de acesso externo não autorizado; é mistura de contexto dentro do workspace.

**Causa:** `special_dates` não possui vínculo por marca e o filtro considera somente o mês. Referências: `db/schema.ts:90`, `components/coody/planning.tsx:42`.

**Aceite:** distinguir datas globais de datas próprias; eventos privados devem aparecer e poder ser utilizados somente pela respectiva marca, com verificação também no servidor.

### P2 — 03. Planejamento salvo não pode ser revisado

Plano criado com campanha A e meta 2. A tentativa de revisão para campanha B e meta 3 recebeu HTTP 400. A interface desabilita metas, dias, campanha e datas quando existe plano. Editar pautas individualmente não corrige a configuração mensal.

**Aceite:** permitir revisão do plano, preservando conteúdos já produzidos e explicando quais pautas serão afetadas. Referências: `app/api/workspace/route.ts:270`, `components/coody/planning.tsx:172`.

### P2 — 04. Navegação por marca excede a largura de celular

Na versão publicada, largura disponível de 390 px e documento com 550 px. A aba Biblioteca termina em 424 px; Configurações termina em 547 px. As abas ficam parcialmente fora da tela e geram transbordamento horizontal.

**Aceite:** todas as abas acessíveis em 390 px, sem transbordamento do documento; testar também 320/360 px e ampliação de texto. Referência: `components/coody/brands.tsx:70`.

### P2 — 05. Upload aceita imagem inválida

Um suposto PNG contendo apenas os quatro bytes iniciais foi aceito com HTTP 200 e registrado na biblioteca. Isso não constitui uma imagem renderizável; a validação verifica apenas parte do cabeçalho.

**Aceite:** rejeitar arquivo truncado ou indecodificável com mensagem útil, sem registro residual. Verificar também JPEG/WEBP/PDF truncados. Não foi feita uma análise completa de arquivos maliciosos. Referência: `lib/asset-upload.ts:23`.

### P2 — 06. Cadastro descarta preenchimento sem aviso

Ao preencher o nome “QA RASCUNHO NÃO SALVO” e pressionar Escape, o modal fechou. Ao reabrir, o campo estava vazio. Não houve confirmação de descarte ou recuperação.

**Aceite:** fechamento de formulário alterado exige decisão explícita de descarte ou mecanismo de recuperação. Referência: `components/coody/brand-onboarding.tsx:133`.

### P2 — 07. Contexto de navegação não sobrevive à atualização

Após concluir cadastro e abrir a visão da marca, atualizar a página retorna à lista de Marcas. Marca e aba existem apenas em estado local; o endereço não identifica a marca. O Studio também depende do item selecionado em memória.

**Aceite:** URLs identificam marca, aba e conteúdo; atualizar, voltar e compartilhar internamente deve preservar o contexto. Referências: `components/coody/brands.tsx:31`, `components/coody/workspace.tsx:58`.

### P2 — 08. Mês inicial fixado em setembro de 2026

Confirmado no código: o workspace sempre inicia com `2026-09`. A consequência em meses futuros é inferida dessa configuração; não foi feita simulação do relógio do sistema.

**Aceite:** iniciar no mês corrente do fuso da operação ou restaurar uma seleção explícita, sem manter uma data demonstrativa fixa. Referência: `components/coody/workspace.tsx:54`.

### P3 — 09. “Conteúdos anteriores” inclui a própria pauta

No Studio da Forma, a contagem mostra quatro conteúdos anteriores, mas a marca tem quatro no total, incluindo o aberto. O contexto recebe todos os conteúdos da marca, sem excluir o atual ou selecionar relevância temporal/temática.

**Aceite:** excluir a pauta atual e definir critérios de relevância antes da integração com IA. Referências: `components/coody/studio.tsx:86`, `lib/brand-memory.ts:175`.

## Dependências de uma entrega operacional

- **Acesso e papéis:** o site está restrito ao proprietário. Usuário e administrador são demonstrativos; não há permissões reais por criativo/aprovador ou cliente no aplicativo. Abrir acesso a clientes antes de implementar e testar essas regras não é uma entrega aceitável. A separação dos arquivos por marca, que passou nos testes, não substitui autorização por usuário.
- **Escopo comercial:** OpenAI, Trello e publicação em redes não estão conectados. Isso é compatível com a etapa arquitetural solicitada, mas impede vender esta versão como sistema completo de geração automática. Deve constar claramente no aceite.
- **Operação:** restauração de backup, retenção, recuperação de uploads, monitoramento e carga não foram validados. O carregamento consulta todas as entidades do workspace, sem paginação; o comportamento com volume real permanece desconhecido.

## Plano de liberação recomendado

1. Desenvolvimento: corrigir concorrência e isolamento de datas; acrescentar testes de regressão que reproduzam ambos.
2. Desenvolvimento/UX: resolver revisão de planejamento, navegação móvel, arquivos inválidos e proteção contra perda de preenchimento; corrigir contexto de navegação e mês inicial.
3. Produto/cliente: formalizar o escopo desta fase e quais integrações ficam para etapas futuras.
4. Engenharia: validar acesso por papel, recuperação de dados e comportamento com volume compatível com a operação pretendida.
5. QA/cliente: executar aceite acompanhado, com duas marcas, arquivos válidos/inválidos, edição, planejamento, duas abas de aprovação e navegação móvel. Liberar somente após os bloqueadores passarem e os demais itens terem resolução ou aceite explícito documentado.

**Limites do parecer:** avaliação funcional e técnica direcionada, não certificação de segurança, acessibilidade completa ou teste de carga. Falhas concorrentes foram reproduzidas localmente na mesma revisão publicada; não foram provocadas em produção. Os dados de teste foram identificados para limpeza local, preservando os cadastros anteriores. Evidências de API estão em `evidencias.json`.
