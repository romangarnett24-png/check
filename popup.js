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
  const aiBtns = document.querySelectorAll('.ai-btn, .ai-btn-small');

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
  chrome.storage.local.get(['editorSavedText', 'primaryProvider', 'googleApiKey', 'openrouterApiKey'], (result) => {
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
  });

  // Сохраняем текст при вводе
  editorTextarea.addEventListener('input', () => {
    chrome.storage.local.set({ editorSavedText: editorTextarea.value });
  });

  // Логика кнопок ИИ
  aiBtns.forEach(btn => {
    btn.addEventListener('click', () => {
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


  // --- Настройки ---
  const providerSelect = document.getElementById('provider');
  const googleKeyInput = document.getElementById('google-key');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');

  // Save settings
  saveBtn.addEventListener('click', () => {
    const primaryProvider = providerSelect.value;
    const googleApiKey = googleKeyInput.value.trim();
    const openrouterApiKey = openrouterKeyInput.value.trim();

    chrome.storage.local.set({
      primaryProvider: primaryProvider,
      googleApiKey: googleApiKey,
      openrouterApiKey: openrouterApiKey
    }, () => {
      statusMsg.textContent = 'Настройки успешно сохранены!';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 3000);
    });
  });
});
