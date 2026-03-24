#!/bin/bash

set -euo pipefail

REPO="/tmp/orbit-git-stress-repo"

rm -rf "$REPO"
mkdir -p "$REPO"
cd "$REPO"
git init

for lang in ts js css py rs; do
  python3 - <<'PY' > "large-file-${lang}.${lang}"
for index in range(10000):
    print(f"// Line {index}: export const value_{index} = {index} * Math.random();")
PY
done

for index in $(seq 1 20); do
  python3 - <<'PY' > "medium-file-${index}.ts"
for inner in range(1000):
    print(f"const item_{inner} = {{ id: {inner}, name: \"item-{inner}\" }};")
PY
done

for index in $(seq 1 50); do
  python3 - <<'PY' > "small-file-${index}.ts"
for inner in range(100):
    print(f"export const x_{inner} = {inner};")
PY
done

git add -A
git commit -m "initial"

find . \( -name '*.ts' -o -name '*.js' -o -name '*.css' -o -name '*.py' -o -name '*.rs' \) \
  -not -path './.git/*' | while read -r file; do
  echo "// MODIFIED $(date +%s)" >> "$file"
done

echo "Stress repo created at $REPO"
echo "Files: $(find . -type f -not -path './.git/*' | wc -l | tr -d ' ')"
