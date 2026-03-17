#!/bin/bash
set -e

SOURCE_BRANCH="feat/migration"
BASE_BRANCH="v0.0.6"
NEW_BRANCH="feat/migration-granular"
LINES_PER_COMMIT=100

echo "=== Granular Commit Script ==="
echo "Source: $SOURCE_BRANCH"
echo "Base:   $BASE_BRANCH"
echo "Target: $NEW_BRANCH"
echo "Lines per commit: ~$LINES_PER_COMMIT"
echo ""

# Generate file list with line counts (no renames to keep it clean)
git diff "${BASE_BRANCH}...${SOURCE_BRANCH}" --numstat --no-renames | sort -t$'\t' -k3 > /tmp/orbit-granular-numstat.txt

total_files=$(wc -l < /tmp/orbit-granular-numstat.txt | tr -d ' ')
echo "Total files to process: $total_files"
echo ""

# Create new branch from base
git checkout "$BASE_BRANCH"
git checkout -b "$NEW_BRANCH"

# Process files in batches
batch_num=0
current_lines=0
batch_files=()
processed=0

while IFS=$'\t' read -r added removed file; do
    # Handle binary files (shown as - -)
    if [ "$added" = "-" ]; then
        added=1
    fi

    batch_files+=("$file")
    current_lines=$((current_lines + added))
    processed=$((processed + 1))

    if [ "$current_lines" -ge "$LINES_PER_COMMIT" ]; then
        batch_num=$((batch_num + 1))

        # Checkout each file from the source branch
        for f in "${batch_files[@]}"; do
            # Create parent directory if needed
            mkdir -p "$(dirname "$f")"
            if git cat-file -e "${SOURCE_BRANCH}:${f}" 2>/dev/null; then
                git checkout "$SOURCE_BRANCH" -- "$f"
            else
                # File was deleted on source branch
                git rm -f "$f" 2>/dev/null || true
            fi
        done

        git add -A

        count=${#batch_files[@]}
        dir=$(dirname "${batch_files[0]}")

        git commit --no-verify -m "feat: add ${count} files from ${dir} (~${current_lines} lines)"

        printf "[%d/%d] Commit %d: %d files, ~%d lines\n" "$processed" "$total_files" "$batch_num" "$count" "$current_lines"

        # Reset batch
        current_lines=0
        batch_files=()
    fi
done < /tmp/orbit-granular-numstat.txt

# Commit remaining files
if [ ${#batch_files[@]} -gt 0 ]; then
    batch_num=$((batch_num + 1))

    for f in "${batch_files[@]}"; do
        mkdir -p "$(dirname "$f")"
        if git cat-file -e "${SOURCE_BRANCH}:${f}" 2>/dev/null; then
            git checkout "$SOURCE_BRANCH" -- "$f"
        else
            git rm -f "$f" 2>/dev/null || true
        fi
    done

    git add -A

    count=${#batch_files[@]}
    dir=$(dirname "${batch_files[0]}")

    git commit --no-verify -m "feat: add ${count} files from ${dir} (~${current_lines} lines)"

    printf "[%d/%d] Commit %d: %d files, ~%d lines\n" "$processed" "$total_files" "$batch_num" "$count" "$current_lines"
fi

echo ""
echo "=== Complete ==="
echo "Created $batch_num commits on $NEW_BRANCH"
echo ""

# Return to source branch
git checkout "$SOURCE_BRANCH"

echo "Back on $SOURCE_BRANCH."
echo "Verify: git log $NEW_BRANCH --oneline | wc -l"
echo "Push:   git push -u origin $NEW_BRANCH"
