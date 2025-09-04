# DriveMind Makefile - ALPHA-CODENAME Production Standards

.PHONY: help setup dev build test lint deploy clean gates

help: ## Show this help message
	@echo "DriveMind - Available Commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies and prepare environment
	@echo "[SETUP] Installing dependencies..."
	npm install
	@echo "[SETUP] Verifying Firebase CLI..."
	npx firebase --version || npm install -g firebase-tools
	@echo "[SETUP] Complete!"

dev: ## Start development server
	@echo "[DEV] Starting Next.js development server..."
	npm run dev

build: ## Build for production
	@echo "[BUILD] Building application..."
	npm run build

test: ## Run test suite
	@echo "[TEST] Running test suite..."
	npm run test:ci

lint: ## Run linting and type checking
	@echo "[LINT] Running ESLint and TypeScript checks..."
	npm run lint
	npm run typecheck

gates: ## Run ALPHA-CODENAME production gates
	@echo "[GATES] Running production delivery gates..."
	./scripts/pre-commit-gates.sh

deploy: gates ## Deploy to Firebase App Hosting (after gates)
	@echo "[DEPLOY] Deploying to Firebase App Hosting..."
	@echo "[DEPLOY] Creating rollback artifacts..."
	git log -1 --format="%H" > .rollback-commit
	@echo "[DEPLOY] Deploying..."
	npm run build
	npx firebase deploy --only hosting
	@echo "[DEPLOY] Success! Deployment complete."
	@echo "[DEPLOY] Health check: https://studio--drivemind-q69b7.us-central1.hosted.app/api/health"

clean: ## Clean build artifacts
	@echo "[CLEAN] Removing build artifacts..."
	rm -rf .next
	rm -rf dist
	rm -rf coverage
	rm -f tsconfig.tsbuildinfo
	@echo "[CLEAN] Complete!"

rollback: ## Rollback to previous deployment
	@echo "[ROLLBACK] Rolling back to previous commit..."
	@if [ -f .rollback-commit ]; then \
		git checkout $$(cat .rollback-commit); \
		npm run build; \
		npx firebase deploy --only hosting; \
		echo "[ROLLBACK] Complete!"; \
	else \
		echo "[ERROR] No rollback commit found"; \
		exit 1; \
	fi