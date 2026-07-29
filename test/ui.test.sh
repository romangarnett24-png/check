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
grep -q 'aria-label' popup.html || grep -q 'aria-label' content.js

# Voice widget contract (TDD: these checks fail until voice input is wired).
grep -q "🎙 Голос" content.js
grep -q "Слушаю…" content.js
grep -q "SpeechRecognition" content.js
grep -q "not-allowed" content.js
grep -q "insertVoiceText" content.js

echo "UI structure checks passed"
