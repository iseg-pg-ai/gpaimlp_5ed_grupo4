# Evidência e aceitação da imagem de curadoria

Revisto em 28 de outubro de 2026. Este pipeline é da alternativa de hosting cloud, não um requisito de arranque no Code Editor. A entrega usa uma imagem linux/amd64 com digest imutável. O build de CI não publica imagens no ECR nem efetua deployment.

## Evidência produzida pelo CI

O workflow `portal.yml` exporta a imagem em OCI, com SBOM SPDX e proveniência SLSA produzidas pelo BuildKit. `scripts/verify_image_delivery.py` verifica:

- correspondência entre o digest emitido pelo build e a raiz OCI;
- SHA-256 e tamanho dos manifests, configuração, documentos e layers usados;
- plataforma linux/amd64 e label de revisão igual ao commit da execução;
- associação da SBOM e da proveniência ao digest do manifest da plataforma;
- existência de uma SBOM SPDX não vazia e de uma proveniência SLSA.

Os testes usam arquivos sintéticos e recusam corrupção de layers, digest ou revisão incorretos, atestações de outra imagem e ausência de SBOM. Isto verifica integridade e ligação dos documentos; não autentica criptograficamente o produtor.

O artefacto `blu-delivery-evidence-COMMIT`, conservado durante 14 dias, contém:

| Ficheiro | Conteúdo |
| --- | --- |
| `delivery.json` | Commit, digests, plataforma, número de pacotes e medições |
| `sbom.json` | Inventário SPDX da imagem final |
| `provenance.json` | Statement SLSA associado ao manifest da plataforma |

`compressed_layers_bytes` é a soma dos tamanhos dos layers comprimidos referidos pelo manifest; `oci_archive_bytes` é o tamanho do arquivo exportado. Nenhum deles representa consumo de RAM, tamanho de cache ou espaço descomprimido em execução.
A imagem não é incluída no artefacto de evidência.

A primeira validação real passou no [CI de f1aea3a](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40250526927): 713 pacotes, 852 839 550 bytes de layers comprimidos e 857 447 424 bytes no arquivo OCI. O relatório confirma `signature_verified: false`. A retenção de 14 dias é para diagnóstico; uma release permanente exigirá conservação aprovada da evidência.

## Smoke obrigatório antes de assinar

A configuração `config/curation_services.json` fornece os mesmos comandos à stack e ao smoke. O CI importa a plataforma linux/amd64 do arquivo OCI para o daemon local e confirma que o ID da configuração corresponde a `config_digest` do arquivo verificado. Esta importação serve apenas o teste: o OCI original, com os seus manifests e atestações, continua a ser a fonte dos bytes a publicar.

O container de teste usa UID 1000, filesystem só de leitura, volumes temporários, sem capabilities, sem privilégios adicionais e `--network none`. Não recebe credenciais AWS nem mounts da pasta de trabalho. Cria um warehouse sintético e credenciais descartáveis do Monitoring; não guarda os logs dos serviços no artefacto.

Verifica arranque dos quatro serviços, um asset JavaScript, leitura pelo adaptador Python, recusa de origem externa e resposta 401 do Monitoring sem sessão. O relatório `delivery.json` só recebe `smoke_verified: true` depois de todas as sondas passarem. Os hashes desse relatório integram o documento de release assinado.
Uma entrega sem este resultado não pode ser preparada para assinatura ou promovida.

A primeira execução completa passou no [CI de c3db94b](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40255889379).
A sonda Python consulta o catálogo canónico criado pelo fixture sintético; não exige tabelas `structured_*`, que dependem do suplemento opcional.

O ensaio não valida TLS/ALB, identidade Cognito, EFS, fornecedores, notificações, concorrência distribuída ou recuperação. Não substitui o smoke de staging nem conclui as pendências de monitoring externo.

## Política antes de promover uma release

Os scripts e os modelos inativos de workflows implementam a preparação de promoção. A execução real
exige revisão e evidência do candidato. A política exige:

1. Commit revisto e integrado em `dev`, com os checks obrigatórios aprovados.
2. Build da revisão exata, SBOM e proveniência associadas ao digest imutável.
3. Assinatura criptográfica verificável do digest, por identidade exclusiva do workflow de release do repositório, sem confiar em identidades de outros repositórios, workflows ou branches.
4. Verificação da identidade do signatário, emissor, assinatura e digest antes da promoção; nunca aceitar apenas a existência de um ficheiro de assinatura.
5. Publicação apenas no ECR da conta e região aprovadas, com permissões mínimas, seguida de confirmação do digest publicado e aprovação do ambiente-alvo.
6. Conservação da referência anterior para rollback, com a mesma verificação.

A assinatura preparada usa Cosign 3.1.4 keyless, com identidade e emissor exatos em `config/image_signing_policy.json`. O modelo [curation-sign.yml.example](workflow-templates/curation-sign.yml.example) está fora dos workflows ativos. Quando reativado, só aceita execuções manuais em `dev`, com `BLU_RELEASE_SIGNING_ENABLED=true`. Exige que o ambiente `curation-release` tenha revisores e `prevent_self_review=true`; sem estas proteções, recusa a operação.

O operador indica o ID do workflow Portal bem-sucedido e o digest aprovado.
O código recusa builds de pull requests, forks, outros branches ou workflows.
`release.json` liga o commit, os digests e os hashes de `delivery.json`, `sbom.json` e `provenance.json`. Cosign assina este documento; a assinatura é destacada e vinculada ao digest, não uma assinatura OCI publicada num registry.

O bundle Sigstore e a evidência ficam num artefacto com retenção de 90 dias.
Antes de promover, é obrigatório voltar a executar `scripts/image_release.py verify` com o digest e a revisão esperados de uma fonte aprovada, sem os inferir do bundle recebido. O verificador usa identidade e emissor exatos, sem desativar verificações de transparência. Não confiar apenas no ficheiro `verification.json` ou numa flag.

O relatório original conserva `signature_verified: false`; o resultado da assinatura é separado. Checks de pull requests recebem apenas leitura e usam chaves temporárias para testes locais, sem identidade OIDC de release nem envio ao log público.

Uma execução keyless só é válida com evidência explícita do workflow. Antes de a ativar: integrar o código revisto em `dev`, configurar os revisores do ambiente, assegurar acesso de leitura à configuração desse ambiente pelo token do workflow e obter autorização para a execução manual. A assinatura keyless regista a identidade pública do workflow no serviço de transparência Sigstore. Não há publicação ECR ou deployment neste fluxo.
A conservação permanente da release e a configuração IAM de publicação são etapas posteriores de uma publicação cloud autorizada.

Uma SBOM é um inventário, não uma auditoria de vulnerabilidades ou prova de que a imagem é segura. A política de segurança e aceitação de riscos continua a aplicar-se.

## Publicação ECR preparada, ainda desativada

O modelo [curation-publish.yml.example](workflow-templates/curation-publish.yml.example) está inativo. Quando reativado, é manual, só no repositório original e em `dev`, com `BLU_ECR_PUBLISH_ENABLED=true`. Usa o mesmo ambiente protegido `curation-release`.
Antes de obter credenciais AWS, verifica a execução do assinante, a assinatura, o digest/revisão indicados pelo operador e os bytes OCI originais.

A CI atual constrói e testa o OCI temporariamente e conserva apenas a evidência, sem carregar o arquivo da imagem. O modelo [portal-oci-artifact.yml.example](workflow-templates/portal-oci-artifact.yml.example), quando inserido no job `container`, conserva os bytes apenas em pushes de `dev` quando `BLU_RELEASE_SIGNING_ENABLED=true`. O arquivo OCI tem retenção de 14 dias, sem compressão adicional do artefacto. A ativação exige aprovação de armazenamento e custos; a versão medida ocupava cerca de 857 MB. Se o arquivo expirar, a operação falha: não é permitida uma reconstrução silenciosa da imagem assinada.

Variáveis do ambiente, a preencher com os valores aprovados:

| Variável | Finalidade |
| --- | --- |
| `TARGET_AWS_ACCOUNT_ID` | Conta AWS autorizada |
| `TARGET_AWS_REGION` | `eu-west-1` |
| `BLU_ECR_REPOSITORY_URI` | Repositório privado existente, sem tag/digest |
| `BLU_ECR_PUBLISH_ROLE_ARN` | Role de publicação assumida por OIDC |

`python -m scripts.prepare_ecr_policy` gera apenas o documento de permissões para revisão. Limita escrita/leitura ao ARN do repositório; só a obtenção do token ECR usa recurso `*`. Não concede criação, eliminação, IAM ou ECS e não aplica políticas.
A confiança OIDC é configurada à parte, com audiência `sts.amazonaws.com` e subject exato do repositório/ambiente. Confirmar o formato real: repositórios novos podem incluir IDs imutáveis no subject. Não usar curingas ou copiar um subject legado.
O ambiente deve admitir apenas `dev`, com revisão sem autoaprovação.

`python -m scripts.publish_image_release` faz preflight por omissão. Só `--execute` contacta AWS e publica: confirma a conta, exige um repositório com tags `IMMUTABLE`, recusa colisões e usa `skopeo copy --all --preserve-digests`. A password ECR passa por stdin e o ficheiro de autenticação é temporário. A tag `git-COMMIT` identifica a entrega; o recibo só marca publicação depois de confirmar no ECR o digest aprovado.
Uma tag já existente com o mesmo digest torna a operação idempotente. Não há criação de recursos, remoção de imagens ou atualização de serviços.

## Reativação dos modelos para uma entrega cloud

A operação no Code Editor não exige assinatura keyless, publicação ECR nem as
variáveis desses modelos. Os testes locais da política de imagem continuam na CI;
não assinam nem publicam uma release de produção.

Para uma futura publicação autorizada:

1. Configurar o ambiente GitHub `curation-release` com revisão, impedimento de
   autoaprovação e acesso limitado a `dev`. A operação individual no Code Editor
   não satisfaz por si só estas condições.
2. Configurar as variáveis de destino da tabela anterior e a confiança OIDC da
   role de publicação. Manter os sinalizadores de ativação desativados durante
   a preparação.
3. Copiar os dois modelos para `.github/workflows/curation-sign.yml` e
   `.github/workflows/curation-publish.yml`, retirando o sufixo `.example`.
   O caminho do assinante em `config/image_signing_policy.json` é o destino
   exigido para a identidade futura, não um workflow atualmente instalado.
4. Inserir o item do modelo `portal-oci-artifact.yml.example` em
   `jobs.container.steps` de `portal.yml`; não copiar esse excerto como workflow
   independente.
5. Rever e testar o candidato. Só depois de aprovação, definir as variáveis de
   repositório `BLU_RELEASE_SIGNING_ENABLED=true` e
   `BLU_ECR_PUBLISH_ENABLED=true`, produzir uma nova build em `dev` e executar
   os workflows manuais com a revisão e o digest aprovados.

Mover ou copiar um modelo não configura permissões, revisores ou recursos AWS.
Não reutilizar uma evidência antiga como prova da nova execução.

## Referência anterior para rollback

`python -m scripts.prepare_image_rollback` exige a evidência assinada da release anterior e os seus digest/revisão aprovados. Por omissão, não contacta AWS; `--confirm-registry` confirma a conta e a presença desse digest no ECR.
Produz uma referência imutável, sem efetuar rollback de serviços ou dados.
`data_compatibility_verified` permanece falso: a compatibilidade de migrações, versões e dados exige o ensaio separado descrito em [Operações](../docs/OPERATIONS.md#fluxo-de-entrega-pretendido).

A publicação ECR e a transferência Skopeo foram testadas com mocks, sem AWS real.
A assinatura OIDC real, a transferência com preservação dos digests, a conservação permanente da evidência e a aplicação da referência de rollback ainda estão pendentes.

## Referências

- [SBOM no Docker](https://docs.docker.com/build/metadata/attestations/sbom/)
- [Armazenamento de atestações](https://docs.docker.com/build/metadata/attestations/attestation-storage/)
- [Operações e critérios de aceitação](../docs/OPERATIONS.md)
