.DEFAULT_GOAL := help
.PHONY: help frontend-install build-frontend frontend-test infra-install infra-test synth-cloud deploy-cloud synthetic-cloud

help:
	@echo "BLU AWS deployment"
	@echo "  make build-frontend   Build the polished site and embedded concierge"
	@echo "  make infra-test       Run infrastructure and Lambda tests"
	@echo "  make synth-cloud      Synthesize all split CDK stacks"
	@echo "  make deploy-cloud     Validate identity, bootstrap and deploy all stacks"
	@echo "  make synthetic-cloud  Send labelled synthetic pipeline events"

frontend-install:
	npm --prefix frontend/blu-cloud-site ci --ignore-scripts --no-audit --no-fund

build-frontend: frontend-install
	npm --prefix frontend/blu-cloud-site run build

frontend-test: frontend-install
	npm --prefix frontend/blu-cloud-site run test:sites

infra-install:
	npm --prefix infra ci --ignore-scripts --no-audit --no-fund

infra-test: infra-install
	npm --prefix infra test
	node --check infra/aws-split-app.mjs
	node --check infra/lambda/backoffice-rag/index.mjs
	node --check infra/lambda/churn-evaluator/index.mjs

synth-cloud: frontend-test build-frontend infra-test
	npm --prefix infra run synth:cloud

deploy-cloud:
	bash scripts/deploy-aws.sh

synthetic-cloud:
	npm --prefix infra run synthetic:cloud
