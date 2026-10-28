# Retenção dos buckets S3

Revisto em 23 de outubro de 2026. Esta política distingue dados ativos de cópias de recuperação e não concede à aplicação permissões administrativas sobre os buckets.

## Evidência histórica de 23 de outubro de 2026

| Controlo | Bucket de dados | Bucket de backups |
| --- | --- | --- |
| Região | `eu-west-1` | `eu-west-1` |
| Prefixo IAM da aplicação | `development/` | `blu-backups/development/` |
| Listagem no prefixo | Validada | Validada |
| Upload e download reais | Validados | Validados |
| Encriptação dos objetos | SSE-S3 `AES256` validada | SSE-S3 `AES256` validada |
| Consulta administrativa pela role | Negada | Negada |

A negação de `GetBucketVersioning`, `GetEncryptionConfiguration`, `GetPublicAccessBlock` e `GetLifecycleConfiguration` à role da aplicação é intencional. Estas definições são administradas na consola e não são necessárias para o portal ler ou escrever nos prefixos autorizados.

## Exceções e validações manuais

As seguintes ações ficam deliberadamente fora da role `SageMakerTeachingExecutionRole`:

- consultar ou alterar versionamento, encriptação por defeito, Block Public Access e lifecycle;
- substituir a configuração lifecycle completa de um bucket;
- eliminar objetos ou versões de backups.

Um `AccessDenied` nestas operações não representa uma falha do backup. Confirma que a aplicação mantém privilégio mínimo. Upload, `HeadObject`, validação por SHA-256 e restauro continuam a ser verificados pelo fluxo operacional.

Não executar `PutBucketLifecycleConfiguration` com uma identidade que não possa ler primeiro `GetBucketLifecycleConfiguration`: a operação substitui a configuração existente e pode remover regras organizacionais. A regra preparada neste projeto só pode ser considerada aplicada depois de um administrador:

1. rever as regras existentes nos dois buckets;
2. adicionar apenas o aborto de multipart incompleto após sete dias;
3. confirmar Versioning, Default Encryption e Block Public Access;
4. voltar a consultar a configuração e guardar evidência da validação.

Estas exceções definem a fronteira administrativa da aplicação. A regra não deve ser apresentada como aplicada enquanto um administrador não a confirmar. Uma revisão documental ou um ensaio histórico não substitui essa consulta atual.

## Decisão proposta

Nos dois buckets, abortar uploads multipart incompletos após sete dias. Esta ação remove apenas partes de uploads que nunca foram concluídos; não elimina objetos publicados ou checkpoints válidos.

No bucket de backups:

- não expirar objetos completos;
- não eliminar versões anteriores;
- não transitar para Glacier enquanto o processo de restauro não suportar o período e o custo de recuperação dessa classe;
- manter `s3:DeleteObject` fora da role da aplicação.

No bucket de dados:

- não expirar ainda `sources/`, `warehouse/` ou `operational/releases/`;
- manter a release indicada por `operational/current.json` imediatamente disponível;
- só introduzir expiração depois de marcar releases substituídas e de testar que  o lifecycle nunca alcança a release ativa.

As releases de fontes e warehouse podem ser inventariadas sem alterar o bucket:

```bash
.venv/bin/python -B -m etl.s3_transport inventory sources
.venv/bin/python -B -m etl.s3_transport inventory warehouse
```

O inventário aplica a mesma validação usada na recuperação. A release válida mais recente fica marcada como `active`, as restantes releases válidas como `superseded` e manifestos incompatíveis ou corrompidos como `invalid`. A operação é estritamente de leitura: não apaga objetos e uma classificação `superseded` não constitui autorização automática para os eliminar. Uma release `invalid` deve ser investigada; se for a mais recente, a release válida anterior permanece ativa.

## Regra segura para aplicar na consola

Em **S3 → bucket → Management → Lifecycle rules → Create lifecycle rule**:

1. Nome: `abort-incomplete-multipart-uploads`.
2. Âmbito: todos os objetos do bucket.
3. Selecionar apenas **Delete incomplete multipart uploads**.
4. Indicar **7 dias** após o início do upload.
5. Não selecionar expiração de versões atuais, versões anteriores ou delete markers.

Aplicar a mesma regra aos dois buckets. A alteração é administrativa e só deve ser efetuada depois de rever na consola que nenhuma outra ação de expiração ficou selecionada.

O ficheiro [`config/s3-lifecycle-abort-multipart.json`](../config/s3-lifecycle-abort-multipart.json) contém a mesma regra para aplicação por um administrador através da AWS CLI:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket NOME-DO-BUCKET \
  --lifecycle-configuration file://config/s3-lifecycle-abort-multipart.json
```

Este comando deve ser executado separadamente nos buckets de dados e backups, depois de confirmar que não substitui regras organizacionais existentes.

## Confirmações administrativas

Em **S3 → bucket → Properties**, confirmar em ambos os buckets:

- Bucket Versioning: `Enabled`;
- Default encryption: `SSE-S3` ou a chave KMS aprovada;
- Block Public Access: todas as opções ativas.

A `SageMakerTeachingExecutionRole` foi novamente testada em 23 de outubro de 2026 e recebeu `AccessDenied` nos quatro controlos administrativos de ambos os buckets. Esta limitação foi aceite como fronteira administrativa concluída para o projeto. A aplicação mantém assim privilégio mínimo; aplicar ou confirmar a regra continua a ser uma operação opcional de uma sessão administrativa.

SSE-KMS só é necessário se existir um requisito organizacional de controlo e auditoria da chave. Nesse caso, é preciso acrescentar à role permissões mínimas da chave e testar upload, download e restauro antes da migração.
