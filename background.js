// =============================================
// background.js — Фоновый сервис-воркер (Service Worker)
// Обрабатывает запросы к API OpenRouter и Google AI Studio
// =============================================

// Системные промпты для каждого режима
const SYSTEM_PROMPTS = {
  improve:
    'Ты профессиональный редактор. Улучши стиль и читаемость этого текста, сделай его более профессиональным, но обязательно сохрани исходный смысл и язык написания. В ответе выдай ТОЛЬКО исправленный текст без кавычек, комментариев и лишних слов.',

  tone_professional:
    'Ты профессиональный редактор. Перепиши этот текст так, чтобы он звучал максимально профессионально и формально. В ответе выдай ТОЛЬКО текст без кавычек, комментариев и лишних слов.',

  tone_friendly:
    'Ты редактор. Перепиши этот текст так, чтобы он звучал максимально дружелюбно, позитивно и открыто. В ответе выдай ТОЛЬКО текст без кавычек, комментариев и лишних слов.',

  tone_confident:
    'Ты редактор. Перепиши этот текст так, чтобы он звучал максимально уверенно и убедительно. В ответе выдай ТОЛЬКО текст без кавычек, комментариев и лишних слов.',

  tone_casual:
    'Ты редактор. Перепиши этот текст так, чтобы он звучал повседневно и расслабленно, как в обычном разговоре. В ответе выдай ТОЛЬКО текст без кавычек, комментариев и лишних слов.',

  length_shorten:
    'Сделай этот текст значительно короче, оставив только самую суть (суммаризируй). В ответе выдай ТОЛЬКО текст без кавычек, комментариев и лишних слов.',

  length_expand:
    'Сделай этот текст более длинным и детальным, раскрой мысль подробнее. В ответе выдай ТОЛЬКО текст без кавычек, комментариев и лишних слов.',

  translate_english:
    'Переведи этот текст на английский язык. Сохрани оригинальный тон и смысл. В ответе выдай ТОЛЬКО перевод без кавычек, комментариев и лишних слов.',

  translate_russian:
    'Переведи этот текст на русский язык. Сохрани оригинальный тон и смысл. В ответе выдай ТОЛЬКО перевод без кавычек, комментариев и лишних слов.',

  fix:
    'Ты корректор. Исправь в этом тексте только грамматические, орфографические, пунктуационные и явные логические ошибки. Не меняй стиль и структуру предложений. В ответе выдай исправленный текст, затем добавь строку "===EXPLANATION===", а затем кратко объясни допущенные ошибки на русском языке (если ошибок не было, напиши "Ошибок не найдено"). Ничего кроме этого не выводи.',
};

const FALLBACK_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3-8b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free'
];

async function queryGoogle(userText, mode, apiKey) {
  if (!apiKey) throw new Error('API ключ Google (Gemini) не настроен');
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.fix;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    system_instruction: {
      parts: { text: systemPrompt }
    },
    contents: [{
      parts: [{ text: userText }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || `Google API ошибка: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0].text) {
    throw new Error('Неожиданный формат ответа от Google API');
  }

  return data.candidates[0].content.parts[0].text.trim();
}

async function queryOpenRouter(userText, mode, apiKey) {
  if (!apiKey) throw new Error('API ключ OpenRouter не настроен');
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.fix;

  const requestBody = {
    models: FALLBACK_MODELS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://text-ai-assistant.ext',
      'X-Title': 'AI Text Assistant',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || `HTTP ошибка: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Неожиданный формат ответа от API');
  }

  return data.choices[0].message.content.trim();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ai-request') {
    const { text, mode } = message;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      sendResponse({ success: false, error: 'Пустой текст' });
      return false;
    }

    if (!SYSTEM_PROMPTS[mode]) {
      sendResponse({ success: false, error: 'Неизвестный режим: ' + mode });
      return false;
    }

    chrome.storage.local.get(['primaryProvider', 'googleApiKey', 'openrouterApiKey'], async (result) => {
      const provider = result.primaryProvider || 'google';
      const googleKey = result.googleApiKey;
      const orKey = result.openrouterApiKey;

      let firstAttempt, secondAttempt;
      let firstKey, secondKey;

      if (provider === 'google') {
        firstAttempt = queryGoogle;
        firstKey = googleKey;
        secondAttempt = queryOpenRouter;
        secondKey = orKey;
      } else {
        firstAttempt = queryOpenRouter;
        firstKey = orKey;
        secondAttempt = queryGoogle;
        secondKey = googleKey;
      }

      try {
        const resultText = await firstAttempt(text, mode, firstKey);
        sendResponse({ success: true, text: resultText });
      } catch (err1) {
        console.error('Первый провайдер не ответил:', err1);
        try {
          // Если первый провалился, пробуем второй
          const resultText2 = await secondAttempt(text, mode, secondKey);
          sendResponse({ success: true, text: resultText2 });
        } catch (err2) {
          console.error('Второй провайдер также не ответил:', err2);
          sendResponse({ success: false, error: `Оба провайдера недоступны. Ошибка 1: ${err1.message}. Ошибка 2: ${err2.message}` });
        }
      }
    });

    return true;
  }
});