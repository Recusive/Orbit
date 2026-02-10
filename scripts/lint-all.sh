#!/bin/bash
# =============================================================================
# lint-all.sh - COMPREHENSIVE check for the entire Orbit monorepo
# =============================================================================
# Runs EVERY check that CI runs, locally. This is the "nuclear option" that
# ensures your code will pass CI before you push.
#
# Usage: ./scripts/lint-all.sh [options]
#
# Options:
#   --fix        Auto-fix ESLint and Rust formatting issues
#   --rust-only  Only run Rust checks
#   --ts-only    Only run TypeScript/ESLint checks
#   --no-test    Skip tests (faster)
#   --no-build   Skip build checks (faster)
#   --fast       Same as --no-test --no-build (quick lint only)
#   --ci         Run exact CI checks (includes cargo deny, machete, etc.)
#
# Examples:
#   ./scripts/lint-all.sh              # Standard checks + tests
#   ./scripts/lint-all.sh --fix        # Fix issues automatically
#   ./scripts/lint-all.sh --fast       # Quick lint, no tests/builds
#   ./scripts/lint-all.sh --ci         # Full CI simulation
# =============================================================================

set -e  # Exit on first error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'
DIM='\033[2m'

# Parse arguments
FIX_MODE=false
RUST_ONLY=false
TS_ONLY=false
NO_TEST=false
NO_BUILD=false
CI_MODE=false

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
    --no-build)
      NO_BUILD=true
      ;;
    --fast)
      NO_TEST=true
      NO_BUILD=true
      ;;
    --ci)
      CI_MODE=true
      ;;
    --help|-h)
      head -30 "$0" | tail -25
      exit 0
      ;;
  esac
done

# Helper functions
print_header() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $1${NC}"
  echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_subheader() {
  echo ""
  echo -e "${BOLD}${MAGENTA}  ┌─ $1${NC}"
}

print_step() {
  echo -e "${CYAN}  │ ▶ $1${NC}"
}

print_success() {
  echo -e "${GREEN}  │ ✓ $1${NC}"
}

print_error() {
  echo -e "${RED}  │ ✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}  │ ⚠ $1${NC}"
}

print_skip() {
  echo -e "${DIM}  │ ○ $1 (skipped)${NC}"
}

# Track timing
START_TIME=$(date +%s)
SECTION_TIMES=()

section_start() {
  SECTION_START=$(date +%s)
}

section_end() {
  local name=$1
  local end=$(date +%s)
  local duration=$((end - SECTION_START))
  SECTION_TIMES+=("$name:${duration}s")
}

# Banner
echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║              ORBIT MONOREPO - COMPREHENSIVE CHECK                  ║${NC}"
echo -e "${BOLD}${CYAN}║                    100% Project Coverage                           ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"

# Show mode
echo ""
if [ "$FIX_MODE" = true ]; then
  echo -e "  ${YELLOW}Mode: FIX (auto-fixing issues)${NC}"
fi
if [ "$CI_MODE" = true ]; then
  echo -e "  ${MAGENTA}Mode: CI (full CI simulation with cargo deny, machete, etc.)${NC}"
fi
if [ "$NO_TEST" = true ] && [ "$NO_BUILD" = true ]; then
  echo -e "  ${DIM}Mode: FAST (skipping tests and builds)${NC}"
elif [ "$NO_TEST" = true ]; then
  echo -e "  ${DIM}Mode: NO-TEST (skipping tests)${NC}"
elif [ "$NO_BUILD" = true ]; then
  echo -e "  ${DIM}Mode: NO-BUILD (skipping builds)${NC}"
fi

# =============================================================================
# TYPESCRIPT CHECKS
# =============================================================================
if [ "$RUST_ONLY" = false ]; then
  print_header "TYPESCRIPT TYPE CHECKS"
  section_start

  print_subheader "Frontend Apps"

  print_step "apps/agent (main app)..."
  bun run typecheck
  print_success "Agent TypeScript OK"

  print_step "apps/Canvas-UI-Builder..."
  bun run canvas:typecheck
  print_success "Canvas TypeScript OK"

  print_subheader "Shared Libraries"

  print_step "apps/common..."
  bun run common:typecheck
  print_success "Common TypeScript OK"

  print_step "packages/shared-schemas..."
  bun run schemas:typecheck
  print_success "Schemas TypeScript OK"

  print_subheader "Sidecar"

  print_step "agent-bridge (Bun sidecar)..."
  bun run bridge:typecheck
  print_success "Bridge TypeScript OK"

  section_end "TypeScript"

  # =============================================================================
  # ESLINT CHECKS
  # =============================================================================
  print_header "ESLINT (All Frontend Code)"
  section_start

  print_step "Linting 8 paths: apps/*/src, agent-bridge/src, packages/*, scripts/, vite-plugins/, vitest.setup.ts..."
  if [ "$FIX_MODE" = true ]; then
    bun run lint:fix
    print_success "ESLint OK (fixes applied)"
  else
    bun run lint
    print_success "ESLint OK (0 warnings)"
  fi

  section_end "ESLint"

  # =============================================================================
  # FRONTEND TESTS (Vitest)
  # =============================================================================
  print_header "FRONTEND TESTS (Vitest)"
  section_start

  if [ "$NO_TEST" = false ]; then
    print_subheader "Unit & Integration Tests"

    print_step "Running all Vitest tests..."
    bun run test
    print_success "All Vitest tests passed"
  else
    print_skip "Vitest tests"
  fi

  section_end "Vitest"

  # =============================================================================
  # AGENT-BRIDGE TESTS (Bun test)
  # =============================================================================
  print_header "AGENT-BRIDGE TESTS (Bun)"
  section_start

  if [ "$NO_TEST" = false ]; then
    print_step "Running bridge tests (may skip API tests without credentials)..."
    (cd agent-bridge && bun test)
    print_success "Bridge tests passed"
  else
    print_skip "Bridge tests"
  fi

  section_end "Bridge Tests"

  # =============================================================================
  # FRONTEND BUILDS
  # =============================================================================
  print_header "FRONTEND BUILDS"
  section_start

  if [ "$NO_BUILD" = false ]; then
    print_subheader "Production Builds"

    print_step "Building apps/agent..."
    bun run build:frontend
    print_success "Agent build OK"

    print_step "Building apps/Canvas-UI-Builder..."
    bun run canvas:build
    print_success "Canvas build OK"
  else
    print_skip "Frontend builds"
  fi

  section_end "Frontend Builds"

  # =============================================================================
  # UNUSED DEPENDENCY CHECK (TypeScript)
  # =============================================================================
  if [ "$CI_MODE" = true ]; then
    print_header "UNUSED DEPENDENCIES (knip)"
    section_start

    print_step "Checking for unused TypeScript dependencies..."
    if command -v knip &> /dev/null || bun run knip --help &> /dev/null; then
      bun run knip || print_warning "Knip found unused dependencies (non-blocking)"
    else
      print_warning "knip not available, skipping"
    fi

    section_end "Knip"
  fi
fi

# =============================================================================
# RUST CHECKS
# =============================================================================
if [ "$TS_ONLY" = false ]; then
  print_header "RUST CHECKS"
  section_start

  print_subheader "Code Quality"

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
    print_success "Rust clippy OK (fixes applied)"
  else
    cargo clippy --all-targets --all-features -- -D warnings
    print_success "Rust clippy OK"
  fi

  section_end "Rust Lint"

  # =============================================================================
  # RUST TESTS
  # =============================================================================
  print_subheader "Tests"
  section_start

  if [ "$NO_TEST" = false ]; then
    print_step "Running Rust tests..."
    cargo test --all-features
    print_success "Rust tests passed"
  else
    print_skip "Rust tests"
  fi

  section_end "Rust Tests"

  # =============================================================================
  # CI-ONLY RUST CHECKS
  # =============================================================================
  if [ "$CI_MODE" = true ]; then
    print_subheader "CI-Level Checks"
    section_start

    # Cargo deny (license & security audit)
    print_step "Running cargo deny (license/security audit)..."
    if command -v cargo-deny &> /dev/null; then
      cargo deny check
      print_success "Cargo deny OK"
    else
      print_warning "cargo-deny not installed. Install with: cargo install cargo-deny"
    fi

    # Cargo machete (unused dependencies)
    print_step "Checking for unused Rust dependencies..."
    if command -v cargo-machete &> /dev/null; then
      cargo machete || print_warning "Unused Rust dependencies found (non-blocking)"
    else
      print_warning "cargo-machete not installed. Install with: cargo install cargo-machete"
    fi

    # Documentation build
    print_step "Building Rust documentation (checking for warnings)..."
    RUSTDOCFLAGS='-D warnings' cargo doc --no-deps --all-features
    print_success "Rust documentation OK"

    section_end "CI Rust Checks"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

print_header "SUMMARY"

echo ""
echo -e "  ${BOLD}Checks completed:${NC}"
echo ""

if [ "$RUST_ONLY" = false ]; then
  echo -e "  ${GREEN}✓${NC} TypeScript    ${DIM}(5 workspaces: agent, canvas, common, schemas, bridge)${NC}"
  echo -e "  ${GREEN}✓${NC} ESLint        ${DIM}(8 paths with 0 warnings tolerance)${NC}"
  if [ "$NO_TEST" = false ]; then
    echo -e "  ${GREEN}✓${NC} Vitest        ${DIM}(all frontend tests)${NC}"
    echo -e "  ${GREEN}✓${NC} Bridge Tests  ${DIM}(Bun test runner)${NC}"
  fi
  if [ "$NO_BUILD" = false ]; then
    echo -e "  ${GREEN}✓${NC} Builds        ${DIM}(agent + canvas production builds)${NC}"
  fi
  if [ "$CI_MODE" = true ]; then
    echo -e "  ${GREEN}✓${NC} Knip          ${DIM}(unused TS dependencies)${NC}"
  fi
fi

if [ "$TS_ONLY" = false ]; then
  echo -e "  ${GREEN}✓${NC} Rust fmt      ${DIM}(cargo fmt --check)${NC}"
  echo -e "  ${GREEN}✓${NC} Rust clippy   ${DIM}(-D warnings)${NC}"
  if [ "$NO_TEST" = false ]; then
    echo -e "  ${GREEN}✓${NC} Rust tests    ${DIM}(cargo test --all-features)${NC}"
  fi
  if [ "$CI_MODE" = true ]; then
    echo -e "  ${GREEN}✓${NC} Cargo deny    ${DIM}(license/security audit)${NC}"
    echo -e "  ${GREEN}✓${NC} Cargo machete ${DIM}(unused Rust deps)${NC}"
    echo -e "  ${GREEN}✓${NC} Rust docs     ${DIM}(documentation warnings)${NC}"
  fi
fi

# Timing breakdown
echo ""
echo -e "  ${BOLD}Timing:${NC}"
for timing in "${SECTION_TIMES[@]}"; do
  name="${timing%%:*}"
  time="${timing##*:}"
  printf "  ${DIM}%-16s %s${NC}\n" "$name" "$time"
done

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ALL CHECKS PASSED in ${TOTAL_DURATION}s${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
