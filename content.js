// =============================================
// content.js — Контент-скрипт расширения
// Поддерживает: <textarea>, <input>, [contenteditable] и обычный текст
// =============================================

(function () {
  'use strict';

  if (window.__taiInitialized) return;
  window.__taiInitialized = true;

  console.log('[TAI] AI Text Assistant content script loaded');

  // =============================================
  // Состояние
  // =============================================
  const state = {
    activeElement: null,
    selectedText: '',
    // Для textarea/input
    selectionStart: 0,
    selectionEnd: 0,
    // Для contenteditable/страницы — сохраняем Range
    savedRange: null,
    resultText: '',
    currentMode: null,
    isContentEditable: false,
    isGeneralPage: false,
  };

  let currentSelectionKey = '';
  let lastActiveElement = null; // Для сохранения фокуса последнего редактируемого поля

  // Отслеживание состояния выделения текста пользователем
  let isSelectingWithMouse = false;
  let isSelectingWithKeyboard = false;

  document.addEventListener('mousedown', () => { isSelectingWithMouse = true; });
  document.addEventListener('mouseup', () => { isSelectingWithMouse = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Shift') isSelectingWithKeyboard = true; });
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift') isSelectingWithKeyboard = false; });

  // Отслеживаем последний активный элемент
  document.addEventListener('focusin', (e) => {
    // Игнорируем фокус внутри нашего Shadow DOM
    if (e.composedPath().includes(host)) return;
    if (isStandardInput(e.target) || isContentEditable(e.target)) {
      lastActiveElement = e.target;
    }
  });

  // =============================================
  // Создание Shadow DOM для изоляции стилей виджета
  // =============================================
  const host = document.createElement('div');
  host.id = 'tai-host';
  // Изолируем CSS-каскад, чтобы стили сайта не ломали виджет
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = '0';
  host.style.left = '0';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Встроенные стили, чтобы виджет отображался моментально
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Общий сброс для элементов виджета */
    :host { all: initial; }

    .tai-wrap { position: fixed; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.4; color: #f1f5f9; pointer-events: none; opacity: 0; transform: translateY(4px); transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
    .tai-wrap.tai-show { opacity: 1; transform: translateY(0); pointer-events: auto; }

    /* Базовый дизайн всплывающих панелей */
    .tai-menu, .tai-loading, .tai-result, .tai-error { background: rgba(22, 22, 28, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1); backdrop-filter: blur(14px) saturate(180%); -webkit-backdrop-filter: blur(14px) saturate(180%); display: flex; }

    /* Меню выбора действия */
    .tai-menu { gap: 0; padding: 8px 12px; flex-direction: column; align-items: flex-start; position: relative; transition: all 0.3s ease; width: max-content; min-width: 260px; max-width: 280px; }
    .tai-menu-main { display: flex; gap: 8px; flex-direction: row; align-items: center; justify-content: space-between; width: 100%; }

    /* Основные кнопки */
    .tai-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 12px; border: none; border-radius: 8px; font-size: 12.5px; font-weight: 550; color: #ffffff; cursor: pointer; white-space: nowrap; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); font-family: inherit; user-select: none; }
    .tai-btn-improve { background: linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%); box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25); }
    .tai-btn-improve:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(124, 58, 237, 0.45); background: linear-gradient(135deg, #8b5cf6 0%, #60a5fa 100%); }
    .tai-btn-improve:active { transform: scale(0.97) translateY(0); }

    .tai-btn-fix { background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%); box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25); }
    .tai-btn-fix:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.45); background: linear-gradient(135deg, #6366f1 0%, #22d3ee 100%); }
    .tai-btn-fix:active { transform: scale(0.97) translateY(0); }

    /* Скрываемое меню с дополнительными опциями */
    .tai-btn-more { width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; padding: 0; }
    .tai-btn-more:hover { background: rgba(255, 255, 255, 0.2); }
    .tai-btn-more svg { width: 14px; height: 14px; transition: transform 0.3s ease; transform: rotate(-90deg); }
    .tai-menu.tai-expanded .tai-btn-more svg { transform: rotate(90deg); }

    .tai-more-options { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.3s ease, opacity 0.3s ease, margin-top 0.3s ease; width: 100%; }
    .tai-menu.tai-expanded .tai-more-options { max-height: 200px; opacity: 1; margin-top: 8px; padding-bottom: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px; }

    /* Второстепенные кнопки (таблетки) */
    .tai-btn-secondary { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 500; color: #cbd5e1; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; font-family: inherit; }
    .tai-btn-secondary:hover { background: rgba(255, 255, 255, 0.15); color: #fff; transform: translateY(-1px); }
    .tai-btn-secondary:active { transform: translateY(0) scale(0.95); }

    /* Панель загрузки */
    .tai-loading { align-items: center; gap: 10px; padding: 10px 16px; color: #e2e8f0; font-size: 13px; font-weight: 500; }

    .tai-spin { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, 0.15); border-top-color: #a78bfa; border-radius: 50%; animation: tai-spin .8s linear infinite; }
    @keyframes tai-spin { to { transform: rotate(360deg); } }

    /* Панель результатов */
    .tai-result { flex-direction: column; width: 320px; max-width: 90vw; padding: 12px; gap: 10px; }
    .tai-result-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 2px; }

    .tai-result-text { max-height: 180px; overflow-y: auto; padding: 8px 10px; background: rgba(10, 10, 15, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; font-size: 12.5px; line-height: 1.4; color: #e2e8f0; white-space: pre-wrap; word-break: break-word; }
    .tai-result-text::-webkit-scrollbar { width: 5px; }
    .tai-result-text::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }

    /* Блок объяснений для режима "Исправить" */
    .tai-result-explanation { margin-top: 8px; font-size: 11.5px; line-height: 1.4; color: #fca5a5; background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); white-space: pre-wrap; word-break: break-word; display: none; }

    .tai-result-actions { display: flex; gap: 8px; justify-content: flex-end; }

    /* Кнопки "Применить" / "Отменить" */
    .tai-btn-apply { background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2); flex-grow: 1; border: none; border-radius: 8px; padding: 6px 12px; font-weight: 550; color: #fff; cursor: pointer; transition: all 0.2s; }
    .tai-btn-apply:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35); background: linear-gradient(135deg, #34d399 0%, #10b981 100%); }

    .tai-btn-cancel { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.1); color: #e2e8f0; border-radius: 8px; padding: 6px 12px; font-weight: 550; cursor: pointer; transition: all 0.2s; }
    .tai-btn-cancel:hover { background: rgba(255, 255, 255, 0.14); color: #ffffff; border-color: rgba(255, 255, 255, 0.2); }

    /* Состояние ошибки */
    .tai-error { flex-direction: column; align-items: flex-start; padding: 12px; width: 260px; background: rgba(28, 16, 16, 0.85); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; font-size: 13px; gap: 6px; }
    .tai-error-title { font-weight: 600; color: #f87171; }
    .tai-error-msg { font-size: 12px; line-height: 1.3; }
  `;
  shadow.appendChild(styleEl);

  const wrap = document.createElement('div');
  wrap.className = 'tai-wrap';
  shadow.appendChild(wrap);

  // --- 1. Меню (Tooltip 1) ---
  const panelMenu = document.createElement('div');
  panelMenu.className = 'tai-menu';

  // Сборка основного меню
  const mainWrap = document.createElement('div');
  mainWrap.className = 'tai-menu-main';

  const primaryBtnsWrap = document.createElement('div');
  primaryBtnsWrap.style.display = 'flex';
  primaryBtnsWrap.style.gap = '8px';

  const btnImprove = document.createElement('button');
  btnImprove.className = 'tai-btn tai-btn-improve';
  btnImprove.innerHTML = 'Улучшить';
  btnImprove.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
  btnImprove.onclick = (e) => { e.stopPropagation(); handleAction('improve'); };

  const btnFix = document.createElement('button');
  btnFix.className = 'tai-btn tai-btn-fix';
  btnFix.innerHTML = 'Исправить ошибки';
  btnFix.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
  btnFix.onclick = (e) => { e.stopPropagation(); handleAction('fix'); };

  primaryBtnsWrap.appendChild(btnImprove);
  primaryBtnsWrap.appendChild(btnFix);

  const btnMore = document.createElement('button');
  btnMore.className = 'tai-btn-more';
  btnMore.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';
  btnMore.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
  btnMore.onclick = (e) => {
    e.stopPropagation();
    panelMenu.classList.toggle('tai-expanded');
  };

  mainWrap.appendChild(primaryBtnsWrap);
  mainWrap.appendChild(btnMore);

  const moreOptionsWrap = document.createElement('div');
  moreOptionsWrap.className = 'tai-more-options';

  function createSecondaryBtn(label, mode) {
    const btn = document.createElement('button');
    btn.className = 'tai-btn-secondary';
    btn.textContent = label;
    btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
    btn.onclick = (e) => {
      e.stopPropagation();
      handleAction(mode);
    };
    return btn;
  }

  const btnProf = createSecondaryBtn('Проф.', 'tone_professional');
  const btnFriendly = createSecondaryBtn('Дружелюб.', 'tone_friendly');
  const btnCasual = createSecondaryBtn('Повседнев.', 'tone_casual');
  const btnConfident = createSecondaryBtn('Уверен.', 'tone_confident');
  const btnShort = createSecondaryBtn('Короче', 'length_shorten');
  const btnLong = createSecondaryBtn('Длиннее', 'length_expand');
  const btnEn = createSecondaryBtn('EN', 'translate_english');
  const btnRu = createSecondaryBtn('RU', 'translate_russian');

  moreOptionsWrap.appendChild(btnProf);
  moreOptionsWrap.appendChild(btnFriendly);
  moreOptionsWrap.appendChild(btnConfident);
  moreOptionsWrap.appendChild(btnCasual);

  const dividerRow = document.createElement('div');
  dividerRow.style.width = '100%';
  dividerRow.style.height = '1px';
  dividerRow.style.background = 'rgba(255, 255, 255, 0.08)';
  dividerRow.style.margin = '4px 0';
  moreOptionsWrap.appendChild(dividerRow);

  moreOptionsWrap.appendChild(btnShort);
  moreOptionsWrap.appendChild(btnLong);
  moreOptionsWrap.appendChild(btnEn);
  moreOptionsWrap.appendChild(btnRu);

  panelMenu.appendChild(mainWrap);
  panelMenu.appendChild(moreOptionsWrap);
  wrap.appendChild(panelMenu);

  // --- 2. Панель загрузки ---
  const panelLoading = document.createElement('div');
  panelLoading.className = 'tai-loading';
  panelLoading.innerHTML = '<div class="tai-spin"></div><span>Обработка ИИ...</span>';
  panelLoading.style.display = 'none';
  wrap.appendChild(panelLoading);

  // --- 3. Панель результата ---
  const panelResult = document.createElement('div');
  panelResult.className = 'tai-result';
  panelResult.style.display = 'none';

  const resultLabel = document.createElement('div');
  resultLabel.className = 'tai-result-label';
  resultLabel.textContent = 'Результат:';

  const resultText = document.createElement('div');
  resultText.className = 'tai-result-text';

  const resultExplanation = document.createElement('div');
  resultExplanation.className = 'tai-result-explanation';
  resultExplanation.style.display = 'none';

  const resultActions = document.createElement('div');
  resultActions.className = 'tai-result-actions';

  const btnApply = document.createElement('button');
  btnApply.className = 'tai-btn-apply';
  btnApply.textContent = 'Применить';
  btnApply.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
  btnApply.onclick = (e) => { e.stopPropagation(); handleApply(); };

  const btnCancel = document.createElement('button');
  btnCancel.className = 'tai-btn-cancel';
  btnCancel.textContent = 'Отменить';
  btnCancel.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
  btnCancel.onclick = (e) => { e.stopPropagation(); hideAll(); };

  resultActions.appendChild(btnCancel);
  resultActions.appendChild(btnApply);
  panelResult.appendChild(resultLabel);
  panelResult.appendChild(resultText);
  panelResult.appendChild(resultExplanation);
  panelResult.appendChild(resultActions);
  wrap.appendChild(panelResult);

  // --- 4. Панель ошибки ---
  const panelError = document.createElement('div');
  panelError.className = 'tai-error';
  panelError.style.display = 'none';

  const errTitle = document.createElement('div');
  errTitle.className = 'tai-error-title';
  errTitle.textContent = 'Ошибка';

  const errMsg = document.createElement('div');
  errMsg.className = 'tai-error-msg';

  panelError.appendChild(errTitle);
  panelError.appendChild(errMsg);
  wrap.appendChild(panelError);

  // =============================================
  // Управление отображением панелей
  // =============================================
  function showPanel(panel) {
    panelMenu.style.display = 'none';
    panelLoading.style.display = 'none';
    panelResult.style.display = 'none';
    panelError.style.display = 'none';
    panelMenu.classList.remove('tai-expanded');
    panel.style.display = 'flex';
    positionTooltip();
    wrap.classList.add('tai-show');
  }

  function hideAll() {
    panelMenu.style.display = 'none';
    panelLoading.style.display = 'none';
    panelResult.style.display = 'none';
    panelError.style.display = 'none';
    wrap.classList.remove('tai-show');
    currentSelectionKey = '';
    state.currentMode = null;
  }

  function showError(msg) {
    errMsg.textContent = msg;
    showPanel(panelError);
    // Закрываем окно ошибки через 4 секунды
    setTimeout(hideAll, 4000);
  }

  // =============================================
  // Вычисление координат и позиционирование
  // =============================================
  function positionTooltip() {
    let top, left;
    const padding = 10;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    if (state.isContentEditable && state.savedRange) {
      const rangeRect = state.savedRange.getBoundingClientRect();
      top = rangeRect.top - padding;
      left = rangeRect.left + rangeRect.width / 2;
    } else if (state.activeElement) {
      const rect = state.activeElement.getBoundingClientRect();
      // Позиционируем по центру видимой части поля ввода
      let visibleTop = Math.max(rect.top, 0);
      let visibleBottom = Math.min(rect.bottom, viewportHeight);
      let visibleCenter = visibleTop + (visibleBottom - visibleTop) / 2;

      top = visibleCenter;
      left = rect.left + rect.width / 2;
    } else if (state.isGeneralPage && state.savedRange) {
      const rangeRect = state.savedRange.getBoundingClientRect();
      top = rangeRect.top - padding;
      left = rangeRect.left + rangeRect.width / 2;
    } else {
      return;
    }

    // Защита от странных координат
    if (top < 0 || top > viewportHeight) top = viewportHeight / 2;
    if (left < 0 || left > viewportWidth) left = viewportWidth / 2;

    wrap.style.left = left + 'px';
    wrap.style.top = top + 'px';
    wrap.style.transform = 'translate(-50%, -100%)';

    requestAnimationFrame(() => {
      const r = wrap.getBoundingClientRect();

      let newTransformX = '-50%';
      let newTransformY = '-100%';
      let adjustedTop = top;

      // Если виджет улетает выше верхнего края страницы
      if (r.top < 5) {
        if (state.activeElement) {
           const rect = state.activeElement.getBoundingClientRect();
           adjustedTop = Math.min(rect.bottom + padding, viewportHeight - r.height - 5);
        } else if (state.savedRange) {
           const rangeRect = state.savedRange.getBoundingClientRect();
           adjustedTop = Math.min(rangeRect.bottom + padding, viewportHeight - r.height - 5);
        } else {
           adjustedTop = 5 + r.height;
        }
        newTransformY = '0';
      }

      // Если виджет выходит за нижний край
      if (r.bottom > viewportHeight - 5) {
         adjustedTop = viewportHeight - r.height - 5;
         newTransformY = '0';
      }

      wrap.style.top = adjustedTop + 'px';

      // Корректировка горизонтального положения (чтобы не вылезал за бока)
      let adjustedLeft = left;
      const currentR = wrap.getBoundingClientRect();
      if (currentR.left < 5) {
        adjustedLeft = 5 + (currentR.width / 2);
      } else if (currentR.right > viewportWidth - 5) {
        adjustedLeft = viewportWidth - 5 - (currentR.width / 2);
      }

      wrap.style.left = adjustedLeft + 'px';
      wrap.style.transform = `translate(${newTransformX}, ${newTransformY})`;
    });
  }

  // =============================================
  // Определение контекста (что сейчас редактируется)
  // =============================================
  function isContentEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    let parent = el.parentElement;
    while (parent) {
      if (parent.isContentEditable) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function isStandardInput(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const t = el.type;
      return t === 'text' || t === '' || t === 'search' || t === 'url';
    }
    return false;
  }

  // =============================================
  // Обнаружение выделения через поллинг (каждые 200мс)
  // =============================================
  function pollSelection() {
    // Если виджет занят загрузкой, показом результата или ошибки — игнорируем новые выделения
    if (panelLoading.style.display !== 'none' || panelResult.style.display !== 'none' || panelError.style.display !== 'none') return;

    // Если пользователь в процессе выделения текста мышью или клавиатурой — ждём
    if (isSelectingWithMouse || isSelectingWithKeyboard) return;

    const el = document.activeElement;

    // --- 1. Стандартные поля ввода (input, textarea) ---
    if (isStandardInput(el)) {
      const start = el.selectionStart;
      const end = el.selectionEnd;

      if (start !== end && start !== undefined && end !== undefined) {
        const text = el.value.substring(start, end).trim();
        if (text.length >= 3) {
          // Строим ключ выделения, чтобы не перерисовывать виджет при каждом цикле поллинга
          const key = 'std:' + start + '|' + end + ':' + el.value.substring(Math.max(0, start - 10), Math.min(el.value.length, end + 10));
          if (key === currentSelectionKey && panelMenu.style.display !== 'none') {
            // positionTooltip(); // Убрано для предотвращения дрожания виджета
          } else if (key !== currentSelectionKey) {
            currentSelectionKey = key;
            state.activeElement = el;
            state.selectedText = text;
            state.selectionStart = start;
            state.selectionEnd = end;
            state.savedRange = null;
            state.isContentEditable = false;
            state.isGeneralPage = false;
            showPanel(panelMenu);
          }
          return;
        }
      }
      hideAll();
      return;
    }

    // --- 2. Редакторы ContentEditable ---
    if (isContentEditable(el)) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const text = sel.toString().trim();
        if (text.length >= 3) {
          const range = sel.getRangeAt(0).cloneRange();
          const key = 'ce:' + text.substring(0, 30);
          if (key === currentSelectionKey && panelMenu.style.display !== 'none') {
            // positionTooltip(); // Убрано для предотвращения дрожания виджета
          } else if (key !== currentSelectionKey) {
            currentSelectionKey = key;
            state.activeElement = el;
            state.selectedText = text;
            state.savedRange = range;
            state.isContentEditable = true;
            state.isGeneralPage = false;
            showPanel(panelMenu);
          }
          return;
        }
      }
      hideAll();
      return;
    }

    // --- 3. Выделение общего текста на странице ---
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.toString().trim();
      if (text.length >= 3) {
        const range = sel.getRangeAt(0).cloneRange();

        // Убеждаемся, что выделение произошло не внутри самого виджета
        if (host.contains(range.startContainer)) {
          return;
        }

        const key = 'gen:' + text.substring(0, 30);
        if (key === currentSelectionKey && panelMenu.style.display !== 'none') {
          // positionTooltip(); // Убрано для предотвращения дрожания виджета
        } else if (key !== currentSelectionKey) {
          currentSelectionKey = key;
          state.activeElement = null;
          state.selectedText = text;
          state.savedRange = range;
          state.isContentEditable = false;
          state.isGeneralPage = true;
          showPanel(panelMenu);
        }
        return;
      }
    }

    // Если ничего не выделено — скрываем панели
    hideAll();
  }

  // Запуск цикла поллинга каждые 200 миллисекунд
  setInterval(pollSelection, 200);

  // =============================================
  // Запуск запроса к фоновому процессу
  // =============================================
  function handleAction(mode) {
    if (!state.selectedText) return;
    state.currentMode = mode;
    state.resultText = '';

    // Заголовки для разных режимов
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
    resultLabel.textContent = modeLabels[mode] || 'Результат:';

    showPanel(panelLoading);

    chrome.runtime.sendMessage(
      { type: 'ai-request', text: state.selectedText, mode: mode },
      (response) => {
        if (chrome.runtime.lastError) {
          showError('Ошибка связи: ' + chrome.runtime.lastError.message);
          return;
        }
        if (!response) {
          showError('Получен пустой ответ от фонового скрипта');
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

          state.resultText = responseText;
          resultText.textContent = responseText;

          if (explanation) {
            resultExplanation.textContent = '💡 ' + explanation;
            resultExplanation.style.display = 'block';
          } else {
            resultExplanation.style.display = 'none';
          }

          showPanel(panelResult);
        } else {
          showError(response.error || 'Неизвестная ошибка API');
        }
      }
    );
  }

  // =============================================
  // Применение результата (Apply)
  // =============================================
  function handleApply() {
    if (!state.resultText) return;

    // Сценарий 1: выделено в contenteditable
    if (state.isContentEditable && state.activeElement) {
      applyContentEditable(state.activeElement, state.savedRange);
    }
    // Сценарий 2: выделено в стандартном input/textarea
    else if (state.activeElement && isStandardInput(state.activeElement)) {
      applyStandardInput(state.activeElement, state.selectionStart, state.selectionEnd);
    }
    // Сценарий 3: выделено на странице, но до этого фокус был в каком-то поле
    else if (state.isGeneralPage && lastActiveElement) {
      if (isContentEditable(lastActiveElement)) {
        // Восстанавливаем фокус и вставляем
        lastActiveElement.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(state.resultText);
          range.insertNode(textNode);
        }
        lastActiveElement.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const start = lastActiveElement.selectionStart;
        const end = lastActiveElement.selectionEnd;
        applyStandardInput(lastActiveElement, start, end);
      }
      hideAll();
    }
    // Сценарий 4: фокусных полей нет, меняем текст прямо на странице
    else if (state.savedRange) {
      const range = state.savedRange;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      range.deleteContents();
      const textNode = document.createTextNode(state.resultText);
      range.insertNode(textNode);
      hideAll();
    }
  }

  function applyStandardInput(el, start, end) {
    const before = el.value.substring(0, start);
    const after = el.value.substring(end);
    const newValue = before + state.resultText + after;

    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, newValue);

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    const pos = start + state.resultText.length;
    el.selectionStart = pos;
    el.selectionEnd = pos;
    el.focus();
    hideAll();
  }

  function applyContentEditable(el, range) {
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    range.deleteContents();
    const textNode = document.createTextNode(state.resultText);
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    el.dispatchEvent(new Event('input', { bubbles: true }));
    hideAll();
  }

  // =============================================
  // Обработчики скрытия по клику вне виджета
  // =============================================
  document.addEventListener('mousedown', (e) => {
    const path = e.composedPath();
    if (path.includes(host)) return;
    if (state.activeElement && path.includes(state.activeElement)) return;
    hideAll();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAll();
  });

})();