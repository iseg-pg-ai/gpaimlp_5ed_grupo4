# Retenção dos buckets S3

Revisto em 22 de outubro de 2026. Esta política distingue dados ativos de cópias
de recuperação e não concede à aplicação permissões administrativas sobre os
buckets.

## Estado verificado

| Controlo | Bucket de dados | Bucket de backups |
| --- | --- | --- |
| Região | `eu-west-1` | `eu-west-1` |
| Prefixo IAM da aplicação | `development/` | `blu-backups/development/` |
| Listagem no prefixo | Validada | Validada |
| Upload e download reais | Validados | Validados |
| Encriptação dos objetos | SSE-S3 `AES256` validada | SSE-S3 `AES256` validada |
| Consulta administrativa pela role | Negada | Negada |

A negação de `GetBucketVersioning`, `GetEncryptionConfiguration`,
`GetPublicAccessBlock` e `GetLifecycleConfiguration` à role da aplicação é
intencional. Estas definições são administradas na consola e não são necessárias
para o portal ler ou escrever nos prefixos autorizados.

## Decisão proposta

Nos dois buckets, abortar uploads multipart incompletos após sete dias. Esta ação
remove apenas partes de uploads que nunca foram concluídos; não elimina objetos
publicados ou checkpoints válidos.

No bucket de backups:

- não expirar objetos completos;
- não eliminar versões anteriores;
- não transitar para Glacier enquanto o processo de restauro não suportar o
  período e o custo de recuperação dessa classe;
- manter `s3:DeleteObject` fora da role da aplicação.

No bucket de dados:

- não expirar ainda `sources/`, `warehouse/` ou `operational/releases/`;
- manter a release indicada por `operational/current.json` imediatamente
  disponível;
- só introduzir expiração depois de marcar releases substituídas e de testar que
  o lifecycle nunca alcança a release ativa.

## Regra segura para aplicar na consola

Em **S3 → bucket → Management → Lifecycle rules → Create lifecycle rule**:

1. Nome: `abort-incomplete-multipart-uploads`.
2. Âmbito: todos os objetos do bucket.
3. Selecionar apenas **Delete incomplete multipart uploads**.
4. Indicar **7 dias** após o início do upload.
5. Não selecionar expiração de versões atuais, versões anteriores ou delete
   markers.

Aplicar a mesma regra aos dois buckets. A alteração é administrativa e só deve
ser efetuada depois de rever na consola que nenhuma outra ação de expiração ficou
selecionada.

## Confirmações administrativas

Em **S3 → bucket → Properties**, confirmar em ambos os buckets:

- Bucket Versioning: `Enabled`;
- Default encryption: `SSE-S3` ou a chave KMS aprovada;
- Block Public Access: todas as opções ativas.

SSE-KMS só é necessário se existir um requisito organizacional de controlo e
auditoria da chave. Nesse caso, é preciso acrescentar à role permissões mínimas
da chave e testar upload, download e restauro antes da migração.
