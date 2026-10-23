.DEFAULT_GOAL := help
.PHONY: help infra-install infra-test synth-cloud deploy-cloud synthetic-cloud

help:
	@echo "BLU AWS deployment"
	@echo "  make infra-test       Run infrastructure and Lambda tests"
	@echo "  make synth-cloud      Synthesize all split CDK stacks"
	@echo "  make deploy-cloud     Validate identity, bootstrap and deploy all stacks"
	@echo "  make synthetic-cloud  Send labelled synthetic pipeline events"

infra-install:
	npm --prefix infra ci --ignore-scripts --no-audit --no-fund

infra-test: infra-install
	npm --prefix infra test
	node --check infra/aws-split-app.mjs
	node --check infra/lambda/backoffice-rag/index.mjs
	node --check infra/lambda/churn-evaluator/index.mjs

synth-cloud: infra-test
	npm --prefix infra run synth:cloud

deploy-cloud:
	bash scripts/deploy-aws.sh

synthetic-cloud:
	npm --prefix infra run synthetic:cloud
