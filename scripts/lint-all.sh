#!/bin/bash
# =============================================================================
# lint-all.sh - Comprehensive linting and type checking for the entire monorepo
# =============================================================================
# Runs all TypeScript, ESLint, and Rust checks in one command.
# Usage: ./scripts/lint-all.sh [--fix] [--rust-only] [--ts-only]
#
# Options:
#   --fix       Auto-fix ESLint and Rust formatting issues
#   --rust-only Only run Rust checks
#   --ts-only   Only run TypeScript/ESLint checks
#   --no-test   Skip tests (faster)
# =============================================================================

set -e  # Exit on first error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Parse arguments
FIX_MODE=false
RUST_ONLY=false
TS_ONLY=false
NO_TEST=false

for arg in "$@"; do
  case $arg in
    --fix)
      FIX_MODE=true
      ;;
    --rust-only)
      RUST_ONLY=true
      ;;
    --ts-only)
      TS_ONLY=true
      ;;
    --no-test)
      NO_TEST=true
      ;;
  esac
done

# Helper functions
print_header() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_step() {
  echo -e "${CYAN}▶ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

# Track timing
START_TIME=$(date +%s)

echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║           ORBIT MONOREPO - COMPREHENSIVE LINT CHECK           ║${NC}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"

if [ "$FIX_MODE" = true ]; then
  echo -e "${YELLOW}Running in FIX mode - will auto-fix issues where possible${NC}"
fi

# =============================================================================
# TYPESCRIPT CHECKS
# =============================================================================
if [ "$RUST_ONLY" = false ]; then
  print_header "TYPESCRIPT TYPE CHECKS (tsc --noEmit)"

  # Agent app
  print_step "Checking apps/agent (main app)..."
  bun run typecheck
  print_success "Agent TypeScript OK"

  # Canvas UI Builder app
  print_step "Checking apps/Canvas-UI-Builder..."
  bun run canvas:typecheck
  print_success "Canvas UI Builder TypeScript OK"

  # Common library
  print_step "Checking apps/common..."
  bun run common:typecheck
  print_success "Common TypeScript OK"

  # Agent Bridge (Bun sidecar)
  print_step "Checking agent-bridge (Bun sidecar)..."
  bun run bridge:typecheck
  print_success "Bridge TypeScript OK"

  # Shared Schemas
  print_step "Checking packages/shared-schemas..."
  bun run schemas:typecheck
  print_success "Schemas TypeScript OK"

  # =============================================================================
  # ESLINT CHECKS
  # =============================================================================
  print_header "ESLINT CHECKS"

  print_step "Linting all frontend code (6 directories)..."
  if [ "$FIX_MODE" = true ]; then
    bun run lint:fix
    print_success "ESLint OK (with fixes applied)"
  else
    bun run lint
    print_success "ESLint OK"
  fi

  # =============================================================================
  # FRONTEND TESTS
  # =============================================================================
  if [ "$NO_TEST" = false ]; then
    print_header "FRONTEND TESTS"

    print_step "Running Canvas tests..."
    bun run canvas:test
    print_success "Canvas tests passed"
  fi
fi

# =============================================================================
# RUST CHECKS
# =============================================================================
if [ "$TS_ONLY" = false ]; then
  print_header "RUST CHECKS"

  # Rust formatting
  print_step "Checking Rust formatting..."
  if [ "$FIX_MODE" = true ]; then
    cargo fmt --all
    print_success "Rust formatting OK (fixed)"
  else
    cargo fmt --all -- --check
    print_success "Rust formatting OK"
  fi

  # Rust clippy (linting)
  print_step "Running Rust clippy..."
  if [ "$FIX_MODE" = true ]; then
    cargo clippy --all-targets --all-features --fix --allow-dirty --allow-staged -- -D warnings
    print_success "Rust clippy OK (with fixes applied)"
  else
    cargo clippy --all-targets --all-features -- -D warnings
    print_success "Rust clippy OK"
  fi

  # Rust tests
  if [ "$NO_TEST" = false ]; then
    print_step "Running Rust tests..."
    cargo test --all-features
    print_success "Rust tests passed"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

print_header "SUMMARY"

echo ""
if [ "$RUST_ONLY" = false ]; then
  echo -e "  ${GREEN}✓${NC} TypeScript (5 projects)"
  echo -e "  ${GREEN}✓${NC} ESLint (6 directories)"
  if [ "$NO_TEST" = false ]; then
    echo -e "  ${GREEN}✓${NC} Canvas tests"
  fi
fi

if [ "$TS_ONLY" = false ]; then
  echo -e "  ${GREEN}✓${NC} Rust formatting"
  echo -e "  ${GREEN}✓${NC} Rust clippy"
  if [ "$NO_TEST" = false ]; then
    echo -e "  ${GREEN}✓${NC} Rust tests"
  fi
fi

echo ""
echo -e "${BOLD}${GREEN}All checks passed in ${DURATION}s${NC}"
echo ""
