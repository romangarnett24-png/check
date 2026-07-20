document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('provider');
  const googleKeyInput = document.getElementById('google-key');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');

  // Load existing settings
  chrome.storage.local.get(['primaryProvider', 'googleApiKey', 'openrouterApiKey'], (result) => {
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
