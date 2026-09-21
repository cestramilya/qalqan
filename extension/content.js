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

  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
    if (!settings.enabled) unblurAll();
    else { seen.clear(); scan(); }
  });

  // Кэш по ТЕКСТУ, а не по узлу: YouTube переиспользует элементы при прокрутке
  const seen = new Map();

  const COMMENT_SELECTOR = "ytd-comment-thread-renderer #content-text, " +
                           "ytd-comment-view-model #content-text";

  function threshold() { return MODES[settings.mode] ?? MODES.moderate; }

  function unblurAll() {
    for (const el of document.querySelectorAll(".tox-blur")) {
      el.classList.remove("tox-blur");
      el.removeAttribute("title");
    }
  }

  function reveal(el) {
    el.classList.remove("tox-blur");
    el.classList.add("tox-revealed");
  }

  function process(el) {
    if (!settings.enabled) return;
    if (el.classList.contains("tox-revealed")) return;   // пользователь уже раскрыл

    const text = (el.innerText || "").trim();
    if (!text) return;

    let prob = seen.get(text);
    if (prob === undefined) {
      prob = toxicProbability(text);
      seen.set(text, prob);
    }

    const hide = prob > threshold();
    el.classList.toggle("tox-blur", hide);

    if (hide && !el.dataset.toxBound) {
      el.dataset.toxBound = "1";
      el.title = "Possibly offensive. Click to reveal";
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
  observer.observe(document.body, { childList: true, subtree: true });

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
  console.log("[Comment Shield] loaded, mode:", settings.mode,
              "threshold:", threshold());
})();
