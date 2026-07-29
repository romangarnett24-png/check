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

# Voice editor contract: the control belongs to the popup editor, not the page widget.
grep -q 'id="voice-btn"' popup.html
grep -q "🎙 Голос" popup.html
! grep -q "🎙 Голос" content.js
grep -q "Слушаю…" content.js
grep -q "SpeechRecognition" content.js
grep -q "not-allowed" content.js
grep -q "insertVoiceText" content.js

# The voice control sits opposite the template-save action in the editor toolbar.
node <<'NODE'
const fs = require('fs');
const html = fs.readFileSync('popup.html', 'utf8');
const toolbar = html.match(/<div class="editor-toolbar">([\s\S]*?)<\/div>/);
if (!toolbar) throw new Error('editor toolbar is missing');
if (!toolbar[1].includes('id="save-template-btn"')) throw new Error('template action is not in editor toolbar');
if (!toolbar[1].includes('id="voice-btn"')) throw new Error('voice action is not opposite template action');
NODE

echo "UI structure checks passed"
