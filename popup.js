document.addEventListener('DOMContentLoaded', () => {
  // --- Табы ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // --- Редактор ---
  const editorTextarea = document.getElementById('editor-textarea');
  const editorLoading = document.getElementById('editor-loading');
  const editorError = document.getElementById('editor-error');
  const editorResult = document.getElementById('editor-result');
  const resultContent = document.getElementById('result-content');
  const resultExplanation = document.getElementById('result-explanation');
  const resultLabel = document.getElementById('result-label');
  const copyBtn = document.getElementById('copy-btn');
  const voiceBtn = document.getElementById('voice-btn');
  const aiBtns = document.querySelectorAll('.ai-btn, .ai-btn-small');
  let voiceRecognition = null;
  let voiceStopRequested = false;

  async function getMicrophonePermissionState() {
    if (!navigator.permissions || !navigator.permissions.query) return 'prompt';
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      return permission.state;
    } catch (error) {
      return 'prompt';
    }
  }

  async function startVoiceRecognition() {
    const permissionState = await getMicrophonePermissionState();
    if (permissionState === 'denied') {
      showError('Микрофон заблокирован для расширения. Откройте настройки разрешений Chrome и включите доступ к микрофону, затем нажмите «🎙 Голос» снова.');
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showError('Голосовой ввод не поддерживается этим браузером. Откройте popup в Chrome.');
      return;
    }

    voiceRecognition = new Recognition();
    voiceStopRequested = false;
    voiceRecognition.lang = 'ru-RU';
    voiceRecognition.interimResults = false;
    voiceRecognition.continuous = true;
    voiceBtn.textContent = 'Слушаю…';
    voiceBtn.classList.add('is-listening');

    voiceRecognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map(result => result[0].transcript)
        .join(' ')
        .trim();
      if (text) {
        const start = editorTextarea.selectionStart;
        const end = editorTextarea.selectionEnd;
        editorTextarea.setRangeText(text, start, end, 'end');
        editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    voiceRecognition.onerror = (event) => {
      voiceStopRequested = true;
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Доступ к микрофону заблокирован. Разрешите микрофон для расширения в настройках Chrome и повторите попытку.'
        : 'Не удалось распознать речь. Попробуйте ещё раз.';
      showError(message);
    };
    voiceRecognition.onend = () => {
      if (!voiceStopRequested && voiceRecognition) {
        try { voiceRecognition.start(); } catch (error) { /* browser is already restarting */ }
        return;
      }
      voiceRecognition = null;
      voiceBtn.textContent = '🎙 Голос';
      voiceBtn.classList.remove('is-listening');
    };
    try {
      voiceRecognition.start();
    } catch (error) {
      voiceStopRequested = true;
      voiceRecognition = null;
      voiceBtn.textContent = '🎙 Голос';
      voiceBtn.classList.remove('is-listening');
      showError('Не удалось начать запись. Проверьте доступ к микрофону и повторите попытку.');
    }
  }

  voiceBtn.addEventListener('click', async () => {
    if (voiceRecognition) {
      voiceStopRequested = true;
      voiceRecognition.stop();
      return;
    }
    await startVoiceRecognition();
  });

  const modeLabels = {
    'improve': 'Улучшенный стиль ИИ:',
    'fix': 'Исправленный текст ИИ:',
    'tone_professional': 'Профессиональный тон:',
    'tone_friendly': 'Дружелюбный тон:',
    'tone_confident': 'Уверенный тон:',
    'tone_casual': 'Повседневный тон:',
    'length_shorten': 'Краткий вариант:',
    'length_expand': 'Развернутый вариант:',
    'translate_english': 'Перевод на английский:',
    'translate_russian': 'Перевод на русский:'
  };

  // Загружаем сохраненный текст при открытии попапа
  chrome.storage.local.get(['editorSavedText', 'primaryProvider', 'googleApiKey', 'openrouterApiKey', 'zaiApiKey', 'localUrl'], (result) => {
    if (result.editorSavedText) {
      editorTextarea.value = result.editorSavedText;
    }
    if (result.primaryProvider) {
      providerSelect.value = result.primaryProvider;
    }
    if (result.googleApiKey) {
      googleKeyInput.value = result.googleApiKey;
    }
    if (result.openrouterApiKey) {
      openrouterKeyInput.value = result.openrouterApiKey;
    }
    if (result.zaiApiKey) {
      document.getElementById('zai-key').value = result.zaiApiKey;
    }
    if (result.localUrl) {
      document.getElementById('local-url').value = result.localUrl;
    }
  });

  // Сохраняем текст при вводе
  editorTextarea.addEventListener('input', () => {
    chrome.storage.local.set({ editorSavedText: editorTextarea.value });
  });

  // Логика кнопок ИИ
  aiBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'voice-btn') return;
      const mode = btn.dataset.mode;
      const text = editorTextarea.value.trim();

      if (!text) {
        showError('Пожалуйста, введите текст для проверки.');
        return;
      }

      // Обновляем UI
      editorError.style.display = 'none';
      editorResult.style.display = 'none';
      editorLoading.style.display = 'flex';
      resultLabel.textContent = modeLabels[mode] || 'Результат:';

      chrome.runtime.sendMessage(
        { type: 'ai-request', text: text, mode: mode },
        (response) => {
          editorLoading.style.display = 'none';

          if (chrome.runtime.lastError) {
            showError('Ошибка связи: ' + chrome.runtime.lastError.message);
            return;
          }
          if (!response) {
            showError('Неизвестная ошибка: нет ответа от расширения');
            return;
          }
          if (response.success) {
            let responseText = response.text;
            let explanation = '';

            if (mode === 'fix' && responseText.includes('===EXPLANATION===')) {
              const parts = responseText.split('===EXPLANATION===');
              responseText = parts[0].trim();
              explanation = parts[1].trim();
            }

            resultContent.textContent = responseText;
            if (explanation) {
              resultExplanation.textContent = explanation;
              resultExplanation.style.display = 'block';
            } else {
              resultExplanation.style.display = 'none';
            }
            editorResult.style.display = 'block';
          } else {
            showError('Ошибка API: ' + (response.error || 'Неизвестная ошибка'));
          }
        }
      );
    });
  });

  function showError(msg) {
    editorLoading.style.display = 'none';
    editorResult.style.display = 'none';
    editorError.textContent = msg;
    editorError.style.display = 'block';
  }

  // Копирование результата
  copyBtn.addEventListener('click', () => {
    const textToCopy = resultContent.textContent;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyBtn.innerHTML;
        copyBtn.textContent = 'Скопировано!';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 2000);
      });
    }
  });

  // --- Шаблоны ---
  const saveTemplateBtn = document.getElementById('save-template-btn');
  const templatesList = document.getElementById('templates-list');
  const noTemplatesMsg = document.getElementById('no-templates-msg');
  let templates = [];

  function renderTemplates() {
    templatesList.innerHTML = '';
    if (templates.length === 0) {
      noTemplatesMsg.style.display = 'block';
      return;
    }
    noTemplatesMsg.style.display = 'none';

    templates.forEach((text, index) => {
      const card = document.createElement('div');
      card.className = 'template-card';

      const textEl = document.createElement('div');
      textEl.className = 'template-text';
      textEl.textContent = text;

      const actionsEl = document.createElement('div');
      actionsEl.className = 'template-actions';

      const insertBtn = document.createElement('button');
      insertBtn.className = 'ai-btn-small';
      insertBtn.textContent = 'Вставить';
      insertBtn.onclick = () => {
        insertTemplateToPage(text, insertBtn);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'template-delete-btn';
      deleteBtn.textContent = '🗑 Удалить';
      deleteBtn.onclick = () => {
        templates.splice(index, 1);
        chrome.storage.local.set({ savedTemplates: templates }, renderTemplates);
      };

      actionsEl.appendChild(insertBtn);
      actionsEl.appendChild(deleteBtn);

      card.appendChild(textEl);
      card.appendChild(actionsEl);
      templatesList.appendChild(card);
    });
  }

  function insertTemplateToPage(text, btn) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) return fallbackCopy(text, btn);

      chrome.tabs.sendMessage(tabs[0].id, { type: 'insert-template', text: text }, function(response) {
        if (chrome.runtime.lastError || !response || !response.success) {
          fallbackCopy(text, btn);
        } else {
          const original = btn.textContent;
          btn.textContent = 'Вставлено!';
          setTimeout(() => btn.textContent = original, 2000);
        }
      });
    });
  }

  function fallbackCopy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Скопировано (вставить не вышло)';
      setTimeout(() => btn.textContent = original, 2000);
    });
  }

  chrome.storage.local.get(['savedTemplates'], (result) => {
    if (result.savedTemplates && Array.isArray(result.savedTemplates)) {
      templates = result.savedTemplates;
    }
    renderTemplates();
  });

  saveTemplateBtn.addEventListener('click', () => {
    const text = editorTextarea.value.trim();
    if (!text) {
      showError('Введите текст для сохранения.');
      return;
    }
    templates.unshift(text); // Добавляем в начало списка
    chrome.storage.local.set({ savedTemplates: templates }, () => {
      renderTemplates();
      const original = saveTemplateBtn.textContent;
      saveTemplateBtn.textContent = '✓ Сохранено!';
      setTimeout(() => saveTemplateBtn.textContent = original, 2000);
    });
  });

  // --- Настройки ---
  const providerSelect = document.getElementById('provider');
  const googleKeyInput = document.getElementById('google-key');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const zaiKeyInput = document.getElementById('zai-key');
  const localUrlInput = document.getElementById('local-url');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');

  // Save settings
  saveBtn.addEventListener('click', () => {
    const primaryProvider = providerSelect.value;
    const googleApiKey = googleKeyInput.value.trim();
    const openrouterApiKey = openrouterKeyInput.value.trim();
    const zaiApiKey = zaiKeyInput.value.trim();
    const localUrl = localUrlInput.value.trim();

    chrome.storage.local.set({
      primaryProvider: primaryProvider,
      googleApiKey: googleApiKey,
      openrouterApiKey: openrouterApiKey,
      zaiApiKey: zaiApiKey,
      localUrl: localUrl
    }, () => {
      statusMsg.textContent = 'Настройки успешно сохранены!';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 3000);
    });
  });
});
