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
grep -q 'aria-label="Голосовой ввод"' popup.html
grep -q 'aria-label="Сохранить как шаблон"' popup.html

# Voice editor contract: the control belongs to the popup editor, not the page widget.
grep -q 'id="voice-btn"' popup.html
grep -q "🎙 Голос" popup.html
! grep -q "🎙 Голос" content.js
grep -q "navigator.permissions" popup.js
grep -q "permissionState" popup.js
! grep -q '"audioCapture"' manifest.json
grep -q "btn.dataset.mode" popup.js
grep -q "if (btn.id === 'voice-btn') return" popup.js
grep -q "Слушаю…" content.js
grep -q "SpeechRecognition" content.js
grep -q "continuous = true" popup.js
grep -q "continuous = true" content.js
grep -q "if (voiceRecognition) voiceRecognition.start()" popup.js
grep -q "if (state.isRecording) recognition.start()" content.js
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
