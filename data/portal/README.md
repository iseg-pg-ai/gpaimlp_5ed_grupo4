# Catálogo operacional materializado

O portal usa `catalog.sqlite` como cache SQL dos registos atuais e do histórico de
revisões. No SageMaker, `just blu it` materializa esta base em `/tmp` a partir da
release operacional ativa no S3 e configura `BLU_DATA_DIR`; esta pasta no checkout
é apenas o caminho local de compatibilidade e permanece fora do Git.

Não editar o warehouse manualmente. A oferta deve ser criada, revista e aprovada
no portal e publicada através do ETL.

As alterações confirmadas entram na fila operacional e numa nova release S3. Os
checkpoints são criados pelo protocolo de recuperação; não copiar a base enquanto
os serviços escrevem nem usar o Git como backup.

Consultar o [guia do DMC Workspace](../../docs/PORTAL.md) para o fluxo de
aprovação e atualização.
