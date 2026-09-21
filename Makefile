.PHONY: install run test lint
install:
	pip install -e ".[dev]"
run:
	uvicorn services.api_gateway.app:app --reload
test:
	pytest -q
lint:
	ruff check .
