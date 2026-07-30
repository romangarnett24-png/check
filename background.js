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
      parts: [{ text: systemPrompt }]
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
  const responseText = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!responseText) {
    throw new Error('Неожиданный формат ответа от Google API');
  }

  return responseText;
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

async function queryLocal(userText, mode, url) {
  if (!url) throw new Error('URL локальной LLM не настроен');

  // Обеспечиваем корректный endpoint, если пользователь ввёл только базовый URL
  let endpoint = url;
  if (!endpoint.endsWith('/chat/completions')) {
    if (!endpoint.endsWith('/')) {
      endpoint += '/';
    }
    endpoint += 'chat/completions';
  }

  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.fix;

  const requestBody = {
    model: 'local-model', // Обычно локальные серверы игнорируют это поле или принимают любое
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || `Local LLM ошибка: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Неожиданный формат ответа от Local LLM');
  }

  return data.choices[0].message.content.trim();
}

async function queryZai(userText, mode, apiKey) {
  if (!apiKey) throw new Error('API ключ Z.ai не настроен');
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.fix;

  const requestBody = {
    model: 'glm-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  };

  const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || `Z.ai API ошибка: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Неожиданный формат ответа от Z.ai API');
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

    chrome.storage.local.get(['primaryProvider', 'googleApiKey', 'openrouterApiKey', 'zaiApiKey', 'localUrl'], async (result) => {
      const provider = result.primaryProvider || 'google';
      const providers = [
        { id: 'google', fn: queryGoogle, key: result.googleApiKey },
        { id: 'openrouter', fn: queryOpenRouter, key: result.openrouterApiKey },
        { id: 'zai', fn: queryZai, key: result.zaiApiKey },
        { id: 'local', fn: queryLocal, key: result.localUrl }
      ];

      // Сортируем так, чтобы выбранный провайдер был первым
      providers.sort((a, b) => {
        if (a.id === provider) return -1;
        if (b.id === provider) return 1;
        return 0;
      });

      let success = false;
      let errors = [];

      for (const p of providers) {
        try {
          const resultText = await p.fn(text, mode, p.key);
          sendResponse({ success: true, text: resultText });
          success = true;
          break; // Успешно ответил, выходим из цикла
        } catch (err) {
          console.error(`Провайдер ${p.id} не ответил:`, err);
          errors.push(`${p.id}: ${err.message}`);
        }
      }

      if (!success) {
        sendResponse({ success: false, error: `Все провайдеры недоступны. Подробности: ${errors.join(' | ')}` });
      }
    });

    return true;
  }
});
