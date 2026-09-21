# ETL

O pipeline recebe CSV, XLS/XLSX, JSON e PDF, normaliza cabeçalhos e texto, remove duplicados, infere a entidade e devolve `ETLRecord` validado. `ETLPipeline.load(..., persist=True)` grava S3 e DynamoDB, com três tentativas exponenciais. Configure buckets e credenciais antes de ativar persistência.
