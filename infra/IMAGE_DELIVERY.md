# Evidência e aceitação da imagem de curadoria

Revisto em 26 de outubro de 2026. A entrega usa uma imagem linux/amd64 com digest
imutável. O build de CI não publica imagens no ECR nem efetua deployment.

## Evidência produzida pelo CI

O workflow `portal.yml` exporta a imagem em OCI, com SBOM SPDX e proveniência SLSA
produzidas pelo BuildKit. `scripts/verify_image_delivery.py` verifica:

- correspondência entre o digest emitido pelo build e a raiz OCI;
- SHA-256 e tamanho dos manifests, configuração, documentos e layers usados;
- plataforma linux/amd64 e label de revisão igual ao commit da execução;
- associação da SBOM e da proveniência ao digest do manifest da plataforma;
- existência de uma SBOM SPDX não vazia e de uma proveniência SLSA.

Os testes usam arquivos sintéticos e recusam corrupção de layers, digest ou revisão
incorretos, atestações de outra imagem e ausência de SBOM. Isto verifica integridade
e ligação dos documentos; não autentica criptograficamente o produtor.

O artefacto `blu-delivery-evidence-COMMIT`, conservado durante 14 dias, contém:

| Ficheiro | Conteúdo |
| --- | --- |
| `delivery.json` | Commit, digests, plataforma, número de pacotes e medições |
| `sbom.json` | Inventário SPDX da imagem final |
| `provenance.json` | Statement SLSA associado ao manifest da plataforma |

`compressed_layers_bytes` é a soma dos tamanhos dos layers comprimidos referidos
pelo manifest; `oci_archive_bytes` é o tamanho do arquivo exportado. Nenhum deles
representa consumo de RAM, tamanho de cache ou espaço descomprimido em execução.
A imagem não é incluída no artefacto de evidência.

A primeira validação real passou no
[CI de f1aea3a](https://github.com/iseg-pg-ai/gpaimlp_5ed_grupo4/actions/runs/40250526927):
713 pacotes, 852 839 550 bytes de layers comprimidos e 857 447 424 bytes no arquivo
OCI. O relatório confirma `signature_verified: false`. A retenção de 14 dias é
para diagnóstico; uma release permanente exigirá conservação aprovada da evidência.

## Política antes de promover uma release

A promoção continua pendente de implementação e validação. Deve exigir:

1. Commit revisto e integrado em `dev`, com os checks obrigatórios aprovados.
2. Build da revisão exata, SBOM e proveniência associadas ao digest imutável.
3. Assinatura criptográfica verificável do digest, por identidade exclusiva do
   workflow de release do repositório, sem confiar em identidades de outros
   repositórios, workflows ou branches.
4. Verificação da identidade do signatário, emissor, assinatura e digest antes
   da promoção; nunca aceitar apenas a existência de um ficheiro de assinatura.
5. Publicação apenas no ECR da conta e região aprovadas, com permissões mínimas,
   seguida de confirmação do digest publicado e aprovação do ambiente-alvo.
6. Conservação da referência anterior para rollback, com a mesma verificação.

O mecanismo de assinatura, identidade de release e configuração IAM/OIDC têm de
ser preparados e validados antes da publicação. O relatório atual conserva
`signature_verified: false`; nenhum resultado desta verificação de integridade
substitui a assinatura ou a aprovação operacional. Checks de pull requests não
recebem credenciais de publicação.

Uma SBOM é um inventário, não uma auditoria de vulnerabilidades ou prova de que a
imagem é segura. A política de segurança e aceitação de riscos continua a aplicar-se.

## Referências

- [SBOM no Docker](https://docs.docker.com/build/metadata/attestations/sbom/)
- [Armazenamento de atestações](https://docs.docker.com/build/metadata/attestations/attestation-storage/)
- [Plano do projeto](../PLAN.md)
