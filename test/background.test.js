const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const requests = [];
const context = {
  console,
  fetch: async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: 'Готово' }] } }] };
      },
    };
  },
  chrome: {
    runtime: { onMessage: { addListener() {} } },
  },
};
vm.runInNewContext(fs.readFileSync('background.js', 'utf8'), context);

(async () => {
  const result = await context.queryGoogle('Проверь текст', 'fix', 'test-key');
  assert.strictEqual(result, 'Готово');
  assert.strictEqual(requests.length, 1);

  const body = JSON.parse(requests[0].options.body);
  assert.deepStrictEqual(body.system_instruction.parts, [{ text: body.system_instruction.parts[0].text }]);
  assert.deepStrictEqual(body.contents, [{ parts: [{ text: 'Проверь текст' }] }]);
  assert.strictEqual(requests[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=test-key');
  console.log('Gemini request contract passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
