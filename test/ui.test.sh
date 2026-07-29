#!/usr/bin/env bash
set -euo pipefail

test -f popup.html
test -f popup.css
test -f popup.js
test -f manifest.json
grep -q 'id="editor-textarea"' popup.html
grep -q 'id="tab-settings"' popup.html
grep -q '#f8fafc' popup.css
grep -q 'prefers-reduced-motion' popup.css
grep -q 'aria-label' popup.html

echo "UI structure checks passed"
