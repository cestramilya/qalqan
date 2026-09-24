// Обход комментариев YouTube и замыливание тех, что модель считает оскорбительными.
// Инференс локальный, сеть не используется.

(async () => {
  // ES-модули в content script напрямую не подключить, поэтому динамический импорт
  const { loadModel, toxicProbability } =
    await import(chrome.runtime.getURL("classifier.js"));

  await loadModel(chrome.runtime.getURL("model.json"));

  const MODES = { moderate: 0.70, strict: 0.50 };   // из таблицы порогов на тесте
  let settings = { enabled: true, mode: "moderate" };

  const stored = await chrome.storage.sync.get(settings);
  settings = { ...settings, ...stored };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes.enabled && !changes.mode) return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue ?? true;
    if (changes.mode) settings.mode = changes.mode.newValue ?? "moderate";
    scanVersion++;
    if (!settings.enabled) unblurAll();
    else { seen.clear(); scan(); }
  });

  // Кэш по ТЕКСТУ, а не по узлу: YouTube переиспользует элементы при прокрутке
  const seen = new Map();
  const elementState = new WeakMap();
  const bound = new WeakSet();
  let scanVersion = 0;
  const TOOLTIP = "Possibly offensive. Click to reveal";

  const COMMENT_SELECTOR = "ytd-comment-thread-renderer #content-text, " +
                           "ytd-comment-view-model #content-text";

  function threshold() { return MODES[settings.mode] ?? MODES.moderate; }

  function unblurAll() {
    for (const el of document.querySelectorAll(".tox-blur, .tox-revealed")) {
      el.classList.remove("tox-blur", "tox-revealed");
      if (el.title === TOOLTIP) el.removeAttribute("title");
    }
  }

  function reveal(el) {
    el.classList.remove("tox-blur");
    el.classList.add("tox-revealed");
    if (el.title === TOOLTIP) el.removeAttribute("title");
    const state = elementState.get(el);
    if (state) state.revealed = true;
  }

  function process(el) {
    const text = (el.innerText || "").trim();
    let state = elementState.get(el);
    if (state?.text !== text) {
      // YouTube переиспользует DOM-узлы: раскрытие старого комментария не должно
      // автоматически раскрывать новый текст в том же узле.
      el.classList.remove("tox-revealed", "tox-blur");
      if (el.title === TOOLTIP) el.removeAttribute("title");
      state = { text, revealed: false, version: -1 };
      elementState.set(el, state);
    }
    if (!settings.enabled || !text || state.revealed || state.version === scanVersion) return;

    let prob = seen.get(text);
    if (prob === undefined) {
      prob = toxicProbability(text);
      seen.set(text, prob);
      if (seen.size > 2000) seen.delete(seen.keys().next().value);
    }

    const hide = prob > threshold();
    el.classList.toggle("tox-blur", hide);
    if (!hide && el.title === TOOLTIP) el.removeAttribute("title");
    state.version = scanVersion;

    if (hide) el.title = TOOLTIP;
    if (hide && !bound.has(el)) {
      bound.add(el);
      el.addEventListener("click", (e) => {
        if (!el.classList.contains("tox-blur")) return;
        e.preventDefault();
        e.stopPropagation();
        reveal(el);
      }, true);
    }
  }

  let scheduled = false;
  function scan() {
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback(() => {
      scheduled = false;
      const nodes = document.querySelectorAll(COMMENT_SELECTOR);
      for (const el of nodes) process(el);
    }, { timeout: 500 });
  }

  // Комментарии подгружаются лениво, при прокрутке и при переходе на другое видео
  const observer = new MutationObserver(() => { if (!document.hidden) scan(); });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });

  // YouTube — одностраничное приложение: при смене видео перезагрузки нет
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      seen.clear();
      setTimeout(scan, 1200);      // даём YouTube дорисовать новую страницу
    }
  }, 800);

  document.addEventListener("visibilitychange", () => { if (!document.hidden) scan(); });

  // попап спрашивает, сколько замылено на этой странице
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "count") {
      sendResponse(document.querySelectorAll(".tox-blur").length);
    }
  });

  scan();
  console.log("[Qalqan] loaded, mode:", settings.mode,
              "threshold:", threshold());
})();
