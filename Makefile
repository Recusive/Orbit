# Snowflake Development Makefile
# ================================
# Professional development commands for the Snowflake editor
#
# Usage: make <target>
# Run 'make help' to see all available commands

.PHONY: help dev debug quiet build release install clean test lint fix ci logs

# Default target
.DEFAULT_GOAL := help

# Colors for terminal output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m
BOLD := \033[1m

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HELP
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

help: ## Show this help message
	@echo ""
	@echo "$(BOLD)Snowflake Development Commands$(RESET)"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "$(BOLD)$(CYAN)Development$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E "^(dev|debug|quiet|web)" | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)$(CYAN)Build$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E "^(build|release|install)" | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)$(CYAN)Quality$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E "^(test|lint|fix|check|ci)" | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)$(CYAN)Utilities$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E "^(clean|logs|deps)" | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEVELOPMENT
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

dev: ## Start development server (balanced logging)
	@echo "$(CYAN)Starting development server...$(RESET)"
	@SNOWFLAKE_LOG_MODE=dev pnpm tauri dev

debug: ## Start with verbose logging (all trace logs)
	@echo "$(YELLOW)Starting debug server (verbose logs)...$(RESET)"
	@SNOWFLAKE_LOG_MODE=debug pnpm tauri dev

quiet: ## Start with minimal logging (warnings only)
	@echo "$(GREEN)Starting quiet server (minimal logs)...$(RESET)"
	@SNOWFLAKE_LOG_MODE=prod pnpm tauri dev

web: ## Start Vite dev server only (no Tauri)
	@echo "$(CYAN)Starting web-only dev server on http://localhost:5176...$(RESET)"
	@pnpm vite

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BUILD
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

build: ## Build production app (.dmg/.exe/.AppImage)
	@echo "$(CYAN)Building production app...$(RESET)"
	@pnpm tauri build
	@echo "$(GREEN)Build complete! Check src-tauri/target/release/bundle/$(RESET)"

release: build ## Alias for build

build-debug: ## Build debug app (faster, with debug symbols)
	@echo "$(YELLOW)Building debug app...$(RESET)"
	@pnpm tauri build --debug

install: ## Install all dependencies (node + rust)
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@pnpm install
	@cargo fetch
	@echo "$(GREEN)Dependencies installed!$(RESET)"

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# QUALITY
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test: ## Run all tests (Rust)
	@echo "$(CYAN)Running Rust tests...$(RESET)"
	@cargo test --all-features

test-verbose: ## Run tests with output
	@echo "$(CYAN)Running Rust tests (verbose)...$(RESET)"
	@cargo test --all-features -- --nocapture

lint: ## Run all linters (TypeScript + Rust)
	@echo "$(CYAN)Linting TypeScript...$(RESET)"
	@pnpm eslint src --max-warnings=0
	@echo "$(CYAN)Linting Rust...$(RESET)"
	@cargo clippy --all-targets --all-features -- -D warnings
	@echo "$(GREEN)All lints passed!$(RESET)"

fix: ## Auto-fix linting issues
	@echo "$(CYAN)Fixing TypeScript...$(RESET)"
	@pnpm eslint src --fix
	@echo "$(CYAN)Fixing Rust formatting...$(RESET)"
	@cargo fmt --all
	@echo "$(CYAN)Fixing Rust lints...$(RESET)"
	@cargo clippy --fix --allow-dirty --allow-staged
	@echo "$(GREEN)Fixes applied!$(RESET)"

check: ## Run all checks (types + lint)
	@echo "$(CYAN)Running TypeScript check...$(RESET)"
	@pnpm tsc --noEmit
	@echo "$(CYAN)Running ESLint...$(RESET)"
	@pnpm eslint src --max-warnings=0
	@echo "$(CYAN)Running Rust format check...$(RESET)"
	@cargo fmt --all -- --check
	@echo "$(CYAN)Running Clippy...$(RESET)"
	@cargo clippy --all-targets --all-features -- -D warnings
	@echo "$(GREEN)All checks passed!$(RESET)"

ci: check test ## Run full CI pipeline (checks + tests)
	@echo "$(GREEN)CI pipeline complete!$(RESET)"

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# UTILITIES
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(RESET)"
	@rm -rf dist node_modules/.vite
	@cargo clean
	@echo "$(GREEN)Clean complete!$(RESET)"

clean-deps: ## Remove all dependencies and rebuild
	@echo "$(RED)Removing all dependencies...$(RESET)"
	@rm -rf node_modules target
	@echo "$(CYAN)Reinstalling...$(RESET)"
	@pnpm install
	@cargo fetch
	@echo "$(GREEN)Dependencies reinstalled!$(RESET)"

logs: ## Show log file location (production builds)
	@echo "$(CYAN)Log files are stored in:$(RESET)"
	@echo "  macOS: ~/Library/Logs/com.snowflake.app/"
	@echo "  Linux: ~/.config/com.snowflake.app/logs/"
	@echo "  Windows: %APPDATA%\\com.snowflake.app\\logs\\"

deps: ## Show dependency tree
	@echo "$(CYAN)Rust dependencies:$(RESET)"
	@cargo tree --depth 1
	@echo ""
	@echo "$(CYAN)Node dependencies:$(RESET)"
	@pnpm list --depth 0
