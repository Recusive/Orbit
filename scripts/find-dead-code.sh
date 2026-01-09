#!/usr/bin/env bash
#
# find-dead-code.sh - Detect unused React components and TypeScript exports
#
# Usage:
#   ./scripts/find-dead-code.sh <target-dir> [search-root] [options]
#
# Examples:
#   ./scripts/find-dead-code.sh apps/agent/src/components
#   ./scripts/find-dead-code.sh apps/agent/src/components/chat apps/agent/src
#   ./scripts/find-dead-code.sh src/components . --delete
#
# Arguments:
#   target-dir   Directory containing components to check for usage
#   search-root  Root directory to search for imports (default: current directory)
#
# Options:
#   --include-props    Include *Props interfaces in dead code check (excluded by default)
#   --include-types    Include all type/interface exports (excluded by default)
#   --verbose          Show detailed search results for each export
#   --delete           Delete dead files after confirmation
#

set -uo pipefail
# Note: -e removed to prevent early exit on grep/rg returning no matches

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Counters
TOTAL_CHECKED=0
DEAD_COUNT=0
LIVE_COUNT=0
SUSPICIOUS_COUNT=0
SKIPPED_COUNT=0

# Arrays to store results
declare -a DEAD_FILES=()
declare -a SUSPICIOUS_FILES=()

# Options
INCLUDE_PROPS=false
INCLUDE_TYPES=false
VERBOSE=false
DELETE_MODE=false

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE}  Dead Code Detector - React/TypeScript${NC}"
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_usage() {
    echo "Usage: $0 <target-dir> [search-root] [options]"
    echo ""
    echo "Arguments:"
    echo "  target-dir   Directory containing components to check"
    echo "  search-root  Root directory to search for imports (default: .)"
    echo ""
    echo "Options:"
    echo "  --include-props    Include *Props interfaces in check"
    echo "  --include-types    Include all type/interface exports"
    echo "  --verbose          Show detailed search info"
    echo "  --delete           Delete dead files (with confirmation)"
    echo ""
    echo "Examples:"
    echo "  $0 apps/agent/src/components"
    echo "  $0 apps/agent/src/components/chat apps/agent/src"
    echo "  $0 apps/agent/src/components --include-types"
    echo "  $0 apps/agent/src/components apps/agent/src --delete"
    exit 1
}

# Extract component/export names from a file
extract_exports() {
    local file="$1"

    # Named exports: export const/let/var/function/class Name
    grep -oE "export[[:space:]]+(const|let|var|function|class)[[:space:]]+[A-Z][a-zA-Z0-9_]+" "$file" 2>/dev/null | \
        awk '{print $NF}'

    # Interface/type exports (only if option enabled)
    if [[ "$INCLUDE_TYPES" == "true" ]]; then
        grep -oE "export[[:space:]]+(interface|type|enum)[[:space:]]+[A-Z][a-zA-Z0-9_]+" "$file" 2>/dev/null | \
            awk '{print $NF}'
    fi

    # Default export function/class: export default function Name
    grep -oE "export[[:space:]]+default[[:space:]]+(function|class)[[:space:]]+[A-Z][a-zA-Z0-9_]+" "$file" 2>/dev/null | \
        awk '{print $NF}'

    # Default export identifier: export default Name (at end of line)
    grep -oE "export[[:space:]]+default[[:space:]]+[A-Z][a-zA-Z0-9_]+[[:space:]]*$" "$file" 2>/dev/null | \
        awk '{print $NF}'

    # Destructured exports: export { A, B, C }
    grep -oE "export[[:space:]]+\{[^}]+\}" "$file" 2>/dev/null | \
        sed 's/export[[:space:]]*{//; s/}//; s/,/\n/g' | \
        sed 's/[[:space:]]//g; s/as.*//' | \
        grep -E "^[A-Z]"
}

# Check if an export should be skipped
should_skip_export() {
    local name="$1"

    # Skip *Props interfaces unless --include-props
    if [[ "$INCLUDE_PROPS" != "true" ]] && [[ "$name" == *Props ]]; then
        return 0
    fi

    # Skip common internal names
    case "$name" in
        Props|State|Context|Provider|Consumer|Ref|Config|Options|Settings|Params)
            return 0
            ;;
    esac

    return 1
}

# Check if a component/export is used anywhere (batched grep for performance)
check_usage() {
    local name="$1"
    local source_file="$2"
    local search_root="$3"

    local usage_count=0
    local has_reexport=false

    # Get the source file basename for filtering
    local source_basename
    source_basename=$(basename "$source_file")

    # === BATCHED USAGE CHECK (single grep with multiple patterns) ===
    local usage_matches
    usage_matches=$(grep -rEl -E \
        --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.js" \
        --exclude-dir="node_modules" \
        --exclude-dir=".git" \
        --exclude-dir="dist" \
        --exclude-dir="build" \
        -e "<${name}[[:space:]/>]" \
        -e "import.*\{[^}]*\b${name}\b" \
        -e "import[[:space:]]+${name}[[:space:]]+from" \
        -e "import[[:space:]]+type.*\b${name}\b" \
        -e "import\(['\"].*${name}" \
        -e "lazy\(.*${name}" \
        -e "\.${name}\b" \
        -e "\.\.\.${name}\b" \
        -e "^[[:space:]]*${name}[[:space:]]*," \
        -e ",[[:space:]]*${name}[[:space:]]*[,)]" \
        -e ":[[:space:]]*${name}[[:space:]]*[,}]" \
        -e "createElement[[:space:]]*\([[:space:]]*${name}" \
        -e "\[.*\b${name}\b.*\]" \
        -e "=[[:space:]]*${name}[[:space:]]*[,;)}]" \
        -e "\(${name}\)" \
        -e "typeof[[:space:]]+${name}" \
        "$search_root" 2>/dev/null || true)

    # Filter out source file and index files, count remaining
    if [[ -n "$usage_matches" ]]; then
        local filtered
        filtered=$(echo "$usage_matches" | grep -v "$source_basename" | grep -v "/index\.ts" | grep -v "/index\.tsx" || true)
        if [[ -n "$filtered" ]]; then
            usage_count=$(echo "$filtered" | wc -l | tr -d ' ')
            [[ "$VERBOSE" == "true" ]] && echo -e "    ${DIM}Found $usage_count usage(s)${NC}" >&2
        fi
    fi

    # === RE-EXPORTS CHECK (barrel files) ===
    local reexport_matches
    reexport_matches=$(grep -rEl -E \
        --include="index.ts" --include="index.tsx" \
        --exclude-dir="node_modules" \
        --exclude-dir=".git" \
        --exclude-dir="dist" \
        --exclude-dir="build" \
        -e "export.*\b${name}\b" \
        "$search_root" 2>/dev/null || true)

    if [[ -n "$reexport_matches" ]]; then
        local filtered_reexports
        filtered_reexports=$(echo "$reexport_matches" | grep -v "$source_basename" || true)
        if [[ -n "$filtered_reexports" ]]; then
            has_reexport=true
        fi
    fi

    # Return results
    if [[ $usage_count -eq 0 ]]; then
        if [[ "$has_reexport" == "true" ]]; then
            echo "BARREL_ONLY"
        else
            echo "DEAD"
        fi
    else
        echo "LIVE"
    fi
}

# Process a single file
process_file() {
    local file="$1"
    local search_root="$2"
    local relative_file="${file#$search_root/}"

    # Skip index.ts barrel files
    if [[ "$file" == *"/index.ts" ]] || [[ "$file" == *"/index.tsx" ]]; then
        return
    fi

    # Skip test files
    if [[ "$file" == *".test."* ]] || [[ "$file" == *".spec."* ]] || [[ "$file" == *"__tests__"* ]]; then
        return
    fi

    # Skip type definition files
    if [[ "$file" == *".d.ts" ]]; then
        return
    fi

    # Get all exports from the file
    local exports
    exports=$(extract_exports "$file" | sort -u)

    # If no exports found, skip
    if [[ -z "$exports" ]]; then
        return
    fi

    # Check each export
    while IFS= read -r export_name; do
        [[ -z "$export_name" ]] && continue

        # Skip certain exports
        if should_skip_export "$export_name"; then
            SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            continue
        fi

        TOTAL_CHECKED=$((TOTAL_CHECKED + 1))

        [[ "$VERBOSE" == "true" ]] && echo -e "${DIM}Checking: $export_name in $relative_file${NC}"

        local status
        status=$(check_usage "$export_name" "$file" "$search_root")

        case "$status" in
            "DEAD")
                DEAD_COUNT=$((DEAD_COUNT + 1))
                DEAD_FILES+=("$relative_file:$export_name")
                ;;
            "BARREL_ONLY")
                SUSPICIOUS_COUNT=$((SUSPICIOUS_COUNT + 1))
                SUSPICIOUS_FILES+=("$relative_file:$export_name")
                ;;
            "LIVE")
                LIVE_COUNT=$((LIVE_COUNT + 1))
                ;;
        esac
    done <<< "$exports"
}

# Delete dead files with confirmation
delete_dead_files() {
    local search_root="$1"

    if [[ ${#DEAD_FILES[@]} -eq 0 ]]; then
        echo -e "${GREEN}No dead files to delete.${NC}"
        return
    fi

    echo -e "${RED}${BOLD}The following files will be deleted:${NC}"
    for item in "${DEAD_FILES[@]}"; do
        local file="${item%%:*}"
        echo -e "  ${RED}✗${NC} $file"
    done
    echo ""

    read -p "Are you sure you want to delete these files? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for item in "${DEAD_FILES[@]}"; do
            local file="${item%%:*}"
            local full_path="$search_root/$file"
            if [[ -f "$full_path" ]]; then
                rm -v "$full_path"
            fi
        done
        echo -e "${GREEN}Deleted ${#DEAD_FILES[@]} files.${NC}"
        echo -e "${YELLOW}Remember to update index.ts barrel exports!${NC}"
    else
        echo -e "${YELLOW}Deletion cancelled.${NC}"
    fi
}

# Main execution
main() {
    local positional_args=()

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --include-props)
                INCLUDE_PROPS=true
                shift
                ;;
            --include-types)
                INCLUDE_TYPES=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --delete)
                DELETE_MODE=true
                shift
                ;;
            --help|-h)
                print_usage
                ;;
            -*)
                echo -e "${RED}Unknown option: $1${NC}"
                print_usage
                ;;
            *)
                positional_args+=("$1")
                shift
                ;;
        esac
    done

    # Restore positional args
    set -- "${positional_args[@]}"

    if [[ $# -lt 1 ]]; then
        print_usage
    fi

    local target_dir="$1"
    local search_root="${2:-.}"

    # Validate directories
    if [[ ! -d "$target_dir" ]]; then
        echo -e "${RED}Error: Target directory '$target_dir' does not exist${NC}"
        exit 1
    fi

    if [[ ! -d "$search_root" ]]; then
        echo -e "${RED}Error: Search root '$search_root' does not exist${NC}"
        exit 1
    fi

    # Convert to absolute paths
    target_dir=$(cd "$target_dir" && pwd)
    search_root=$(cd "$search_root" && pwd)

    print_header

    echo -e "${CYAN}Target directory:${NC} $target_dir"
    echo -e "${CYAN}Search root:${NC}      $search_root"
    echo -e "${CYAN}Options:${NC}          props=${INCLUDE_PROPS}, types=${INCLUDE_TYPES}, verbose=${VERBOSE}"
    echo ""
    echo -e "${YELLOW}Analyzing exports...${NC}"

    # Count files first for progress
    local file_count
    file_count=$(find "$target_dir" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.d.ts" ! -name "index.ts" ! -name "index.tsx" 2>/dev/null | wc -l | tr -d ' ')
    local current_file=0

    # Check if stdout is a terminal for progress display
    local is_tty=false
    [[ -t 1 ]] && is_tty=true

    # Find all TypeScript/React files in target directory
    while IFS= read -r -d '' file; do
        current_file=$((current_file + 1))
        if [[ "$is_tty" == "true" ]]; then
            printf "\r${DIM}[%d/%d] %-40s${NC}" "$current_file" "$file_count" "$(basename "$file")"
        fi
        process_file "$file" "$search_root"
    done < <(find "$target_dir" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.d.ts" ! -name "index.ts" ! -name "index.tsx" -print0 2>/dev/null)

    if [[ "$is_tty" == "true" ]]; then
        printf "\r${DIM}Processed %d files.                                       ${NC}\n" "$file_count"
    else
        echo -e "${DIM}Processed $file_count files.${NC}"
    fi

    # Print results
    echo ""
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  RESULTS${NC}"
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Dead files (definitely unused)
    if [[ ${#DEAD_FILES[@]} -gt 0 ]]; then
        echo -e "${RED}${BOLD}🗑️  DEAD CODE (safe to delete):${NC}"
        echo ""
        for item in "${DEAD_FILES[@]}"; do
            local file="${item%%:*}"
            local export="${item##*:}"
            echo -e "  ${RED}✗${NC} $file"
            echo -e "    ${DIM}└─ export:${NC} $export"
        done
        echo ""
    fi

    # Suspicious files (exported but only in barrel)
    if [[ ${#SUSPICIOUS_FILES[@]} -gt 0 ]]; then
        echo -e "${YELLOW}${BOLD}⚠️  SUSPICIOUS (exported in index.ts but never imported):${NC}"
        echo ""
        for item in "${SUSPICIOUS_FILES[@]}"; do
            local file="${item%%:*}"
            local export="${item##*:}"
            echo -e "  ${YELLOW}?${NC} $file"
            echo -e "    ${DIM}└─ export:${NC} $export"
        done
        echo ""
    fi

    # Summary
    echo -e "${BOLD}${BLUE}────────────────────────────────────────────────────────────${NC}"
    echo -e "${BOLD}  SUMMARY${NC}"
    echo -e "${BOLD}${BLUE}────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${CYAN}Total exports checked:${NC}  $TOTAL_CHECKED"
    echo -e "  ${GREEN}Live (in use):${NC}          $LIVE_COUNT"
    echo -e "  ${YELLOW}Suspicious:${NC}             $SUSPICIOUS_COUNT"
    echo -e "  ${RED}Dead (unused):${NC}          $DEAD_COUNT"
    echo -e "  ${DIM}Skipped (props/types):${NC}  $SKIPPED_COUNT"
    echo ""

    if [[ $DEAD_COUNT -gt 0 ]] || [[ $SUSPICIOUS_COUNT -gt 0 ]]; then
        echo -e "${BOLD}Recommended actions:${NC}"
        if [[ $DEAD_COUNT -gt 0 ]]; then
            echo -e "  ${RED}•${NC} Delete dead files listed above"
        fi
        if [[ $SUSPICIOUS_COUNT -gt 0 ]]; then
            echo -e "  ${YELLOW}•${NC} Review suspicious files - may be dynamically loaded"
        fi
        echo -e "  ${CYAN}•${NC} Update index.ts barrel exports after deletion"
        echo -e "  ${CYAN}•${NC} Run 'bun run typecheck' to verify"
        echo ""

        # Handle delete mode
        if [[ "$DELETE_MODE" == "true" ]] && [[ $DEAD_COUNT -gt 0 ]]; then
            delete_dead_files "$search_root"
        fi
    else
        echo -e "  ${GREEN}✓ No dead code detected!${NC}"
        echo ""
    fi

    # Exit with code based on findings
    if [[ $DEAD_COUNT -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

main "$@"
