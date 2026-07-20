// =============================================
// background.js — Фоновый сервис-воркер (Service Worker)
// Обрабатывает запросы к API OpenRouter от content script
// =============================================

const OPENROUTER_API_KEY = 'YOUR_API_KEY_HERE'; // Замените на ваш собственный API-ключ

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

  fix:
    'Ты корректор. Исправь в этом тексте только грамматические, орфографические, пунктуационные и явные логические ошибки. Не меняй стиль и структуру предложений. В ответе выдай исправленный текст, затем добавь строку "===EXPLANATION===", а затем кратко объясни допущенные ошибки на русском языке (если ошибок не было, напиши "Ошибок не найдено"). Ничего кроме этого не выводи.',
};

const FALLBACK_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3-8b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free'
];

async function queryOpenRouter(userText, mode) {
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
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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

    queryOpenRouter(text, mode)
      .then((resultText) => {
        sendResponse({ success: true, text: resultText });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});