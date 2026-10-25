/* Enquadramento por ecrã: preserva conteúdo e estado sem deslocação vertical. */
window.BluViewport = (() => {
  const scene = document.querySelector("#scene");
  const frame = document.querySelector("#scene-window");
  const pager = document.querySelector("#content-pages");
  const previous = document.querySelector("#content-previous");
  const next = document.querySelector("#content-next");
  let page = 0;
  let count = 1;
  let pending;
  const gap = 24;
  const stride = () => frame.clientWidth + gap;
  function update() {
    previous.disabled = page === 0;
    next.disabled = page === count - 1;
    pager.dataset.active = String(count > 1);
    document.querySelector("#content-counter").textContent =
      count > 1
        ? `Passo ${page + 1} de ${count} · mesmo capítulo`
        : "Capítulo completo neste ecrã";
  }
  function show(value) {
    page = Math.max(0, Math.min(count - 1, value));
    scene.scrollLeft = page * stride();
    update();
  }
  function fit() {
    const selected = page;
    scene.classList.remove("is-paged");
    scene.classList.toggle("is-short-frame", frame.clientHeight < 320);
    scene.scrollLeft = 0;
    scene.style.setProperty("--frame-width", `${frame.clientWidth}px`);
    scene.style.setProperty("--frame-height", `${frame.clientHeight}px`);
    const overflow =
      scene.scrollHeight > frame.clientHeight + 2 ||
      scene.scrollWidth > frame.clientWidth + 2;
    if (overflow) scene.classList.add("is-paged");
    count = overflow
      ? Math.max(1, Math.ceil((scene.scrollWidth + gap) / stride()))
      : 1;
    show(selected);
  }
  function refresh(reset = false) {
    if (reset) {
      page = 0;
      const intro = document.createElement("p");
      intro.className = "viewport-intro";
      intro.textContent = document.querySelector("#intro").textContent;
      scene.prepend(intro);
    }
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(fit);
  }
  function step(direction) {
    if (page + direction < 0 || page + direction >= count) return false;
    show(page + direction);
    return true;
  }
  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  scene.addEventListener("scroll", () => {
    const value = Math.max(
      0,
      Math.min(count - 1, Math.round(scene.scrollLeft / stride())),
    );
    if (value !== page) {
      page = value;
      update();
    }
  });
  new ResizeObserver(() => refresh()).observe(frame);
  new MutationObserver((changes) => {
    if (changes.some((change) => !change.target.closest?.(".tech-wires")))
      refresh();
  }).observe(scene, { childList: true, subtree: true, characterData: true });
  scene.addEventListener("toggle", () => refresh(), true);
  document.addEventListener("click", (event) => {
    const mappings = [
      ["[data-tech-requirement]", "#tech-requirement-detail"],
      ["[data-tech-node]", "#tech-node-detail"],
      ["[data-tech-stack]", "#tech-stack-detail"],
      ["[data-tech-proof]", "#tech-proof-detail"],
      ["[data-tech-mechanism]", "#tech-mechanism-detail"],
      [
        "#tech-advance, #tech-failure, [data-tech-phase]",
        "#tech-process-status",
      ],
      ["[data-assist]", "#assistant-response"],
      ["[data-mode]", "#mode-description"],
      ["[data-version]", "#document-preview"],
      ["[data-stop]", "#place-detail"],
      ["#free-toggle", "#free-slot"],
    ];
    const match = mappings.find(([selector]) => event.target.closest(selector));
    if (!match) return;
    requestAnimationFrame(() => {
      fit();
      const target = scene.querySelector(match[1]);
      if (target && count > 1) {
        const rect = target.getClientRects()[0];
        const left =
          rect.left - scene.getBoundingClientRect().left + scene.scrollLeft;
        show(Math.floor((left + 1) / stride()));
      }
    });
  });
  document.fonts.ready.then(() => refresh());
  return { refresh, step };
})();
