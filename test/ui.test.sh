#!/usr/bin/env bash
set -euo pipefail

test -f index.html
test -f styles.css
grep -q 'data-testid="today-progress"' index.html
grep -q 'data-testid="quick-add"' index.html
grep -q '#f7f8f5' styles.css
grep -q 'prefers-reduced-motion' styles.css

echo "UI structure checks passed"
