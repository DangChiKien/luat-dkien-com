/* =========================================================================
 * Luật Nhà ở 2023 — Reader interactivity
 * Owned by READER agent. Depends on:
 *   - window.LuatUI  (from ../script.js): initTheme / copyText / toast
 *   - marked         (global, from CDN)
 *
 * Loads ./manifest.json + the 13 chapter markdown files, renders them,
 * and wires up search, scrollspy, article selection and copy-to-AI tools.
 * ========================================================================= */
(function () {
  "use strict";

  /* ---- Constants ------------------------------------------------------- */

  // Canonical public base for ALL copy outputs (NOT the local origin).
  const BASE_URL = "https://luat.dkien.com";
  const LAW_PATH = "/luat-nha-o-2023"; // path segment under BASE_URL for files
  const LAW_NAME = "Luật Nhà ở 2023 (27/2023/QH15)";
  const SOURCE_URL = "https://luat.dkien.com";
  const WARN_WORD_LIMIT = 30000; // show "nội dung lớn" warning above this

  /* ---- State ----------------------------------------------------------- */

  // articles[] holds one entry per Điều, in document order:
  //   { dieu, title, chRoman, file, bodyMarkdown, bodyText, wordCount, el }
  let articles = [];
  const articleByDieu = new Map(); // dieu(int) -> article object
  const selected = new Set();       // selected dieu numbers (int)

  let manifest = null;
  let currentChapterFile = null;    // file of chapter currently in view (scrollspy)

  /* ---- Tiny DOM helpers ------------------------------------------------ */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === "class") node.className = props[k];
        else if (k === "html") node.innerHTML = props[k];
        else if (k === "text") node.textContent = props[k];
        else if (k.startsWith("data-")) node.setAttribute(k, props[k]);
        else if (k in node) node[k] = props[k];
        else node.setAttribute(k, props[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  /* ---- Text utilities -------------------------------------------------- */

  // Remove Vietnamese diacritics + lowercase for accent-insensitive matching.
  function normalize(str) {
    return (str || "")
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining marks
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .trim();
  }

  // Word count: split on any whitespace, ignore empties.
  function countWords(text) {
    const t = (text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  // Vietnamese thousands separator: dot. e.g. 12345 -> "12.345"
  function formatVi(n) {
    return n.toLocaleString("vi-VN");
  }

  // Strip markdown to plain text for copy/body output and word counting.
  // Keeps line structure so legal clauses stay readable.
  function markdownToPlain(md) {
    let t = md || "";
    // Remove blockquote markers and heading hashes at line starts.
    t = t.replace(/^[ \t]*>[ \t]?/gm, "");
    t = t.replace(/^[ \t]*#{1,6}[ \t]*/gm, "");
    // Bold / italic / inline code markers.
    t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
    t = t.replace(/\*([^*]+)\*/g, "$1");
    t = t.replace(/`([^`]+)`/g, "$1");
    // Links [text](url) -> text
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    // Collapse 3+ blank lines.
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  /* ---- URL helpers ----------------------------------------------------- */

  function chapterUrl(file) {
    return `${BASE_URL}${LAW_PATH}/${file}`;
  }
  function articleUrl(file, dieu) {
    return `${chapterUrl(file)}#dieu-${dieu}`;
  }

  /* =======================================================================
   * STARTUP
   * ===================================================================== */

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const loading = $("#loading");
    const content = $("#law-content");

    try {
      manifest = await fetchJSON("./manifest.json");
    } catch (err) {
      showFatal(loading, "Không tải được dữ liệu luật (manifest.json). Vui lòng thử lại sau.");
      console.error("manifest load failed:", err);
      return;
    }

    if (!manifest || !Array.isArray(manifest.chapters) || !manifest.chapters.length) {
      showFatal(loading, "Dữ liệu luật không hợp lệ.");
      return;
    }

    // Build sidebar immediately from manifest (no need to wait for md files).
    buildSidebar(manifest.chapters);

    // Fetch all chapter markdown files in declared order.
    let chapterTexts;
    try {
      chapterTexts = await Promise.all(
        manifest.chapters.map((ch) => fetchText("./" + ch.file))
      );
    } catch (err) {
      showFatal(loading, "Không tải được nội dung các chương. Vui lòng thử lại sau.");
      console.error("chapter load failed:", err);
      return;
    }

    // Render every chapter into #law-content, building the articles index.
    manifest.chapters.forEach((ch, i) => {
      renderChapter(ch, chapterTexts[i], content);
    });

    // Done loading.
    if (loading) loading.remove();

    // Wire everything now that the DOM is populated.
    setupScrollspy();
    setupSearch();
    setupSelection();
    updateToolbar();

    // If the page was opened with a #dieu-N hash, jump to it.
    if (location.hash && /^#dieu-\d+$/.test(location.hash)) {
      const dieu = parseInt(location.hash.slice(6), 10);
      // Defer so layout is settled.
      requestAnimationFrame(() => scrollToArticle(dieu, true));
    }
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return res.json();
  }
  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return res.text();
  }

  function showFatal(loadingNode, msg) {
    if (loadingNode) {
      loadingNode.innerHTML = "";
      loadingNode.classList.add("error");
      loadingNode.appendChild(el("p", { class: "load-error", text: "⚠ " + msg }));
    }
  }

  /* =======================================================================
   * SIDEBAR
   * ===================================================================== */

  function buildSidebar(chapters) {
    const nav = $("#chapter-nav");
    if (!nav) return;
    nav.innerHTML = "";

    chapters.forEach((ch) => {
      const item = el("div", { class: "chap-item", "data-file": ch.file, "data-roman": ch.roman });

      // Checkbox: select whole chapter.
      const cb = el("input", {
        type: "checkbox",
        class: "chap-checkbox",
        "aria-label": "Chọn cả Chương " + ch.roman,
      });
      cb.dataset.file = ch.file;
      cb.addEventListener("change", () => toggleChapterSelection(ch.file, cb.checked));

      // Link: scroll to chapter heading.
      const link = el("a", {
        class: "chap-link",
        href: "#chuong-" + slugRoman(ch.roman),
        html:
          '<span class="chap-roman">Chương ' +
          escapeHtml(ch.roman) +
          "</span> — " +
          '<span class="chap-title">' +
          escapeHtml(ch.title) +
          "</span>",
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToChapter(ch.file);
      });

      // 📋 copy chapter-file URL.
      const copyBtn = el("button", {
        type: "button",
        class: "chap-copylink",
        title: "Sao chép liên kết chương",
        "aria-label": "Sao chép liên kết Chương " + ch.roman,
        text: "📋",
      });
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        LuatUI.copyText(chapterUrl(ch.file)).then(() =>
          LuatUI.toast("Đã sao chép liên kết chương")
        );
      });

      item.appendChild(cb);
      item.appendChild(link);
      item.appendChild(copyBtn);
      nav.appendChild(item);
    });
  }

  function slugRoman(roman) {
    return String(roman).toLowerCase();
  }

  /* =======================================================================
   * RENDERING — split each chapter md into articles
   * ===================================================================== */

  // Build a marked renderer whose ## Điều N headings get id="dieu-N".
  function makeArticleRenderer() {
    const renderer = new marked.Renderer();
    const baseHeading = renderer.heading.bind(renderer);
    renderer.heading = function (text, level, raw) {
      // marked passes either (text, level, raw) (older) or a token (newer).
      let body, lvl, source;
      if (typeof text === "object" && text !== null) {
        body = text.text;
        lvl = text.depth;
        source = text.text;
      } else {
        body = text;
        lvl = level;
        source = raw != null ? raw : text;
      }
      const m = /Điều\s+(\d+)/i.exec(stripTags(source));
      if (lvl === 2 && m) {
        return `<h2 id="dieu-${m[1]}">${body}</h2>`;
      }
      // Fall back to default for other headings (we mostly render bodies
      // separately, so this primarily matters for safety).
      if (typeof baseHeading === "function") {
        try {
          return baseHeading.apply(renderer, arguments);
        } catch (e) {
          /* fall through */
        }
      }
      return `<h${lvl}>${body}</h${lvl}>`;
    };
    return renderer;
  }

  const ARTICLE_RENDERER = (function () {
    try {
      return makeArticleRenderer();
    } catch (e) {
      return null;
    }
  })();

  function renderMarkdown(md) {
    if (typeof marked === "undefined") return escapeHtml(md);
    const parse = marked.parse || marked;
    return ARTICLE_RENDERER ? parse(md, { renderer: ARTICLE_RENDERER }) : parse(md);
  }

  // Split a chapter's raw markdown into blocks keyed by structure.
  // Returns { chapterHeading, intro, blocks: [{type:'muc'|'dieu', ...}] }
  function splitChapter(rawMd) {
    const lines = rawMd.split(/\r?\n/);
    const result = { chapterHeading: "", chapterTitle: "", intro: [], blocks: [] };

    let current = null; // current article accumulator
    let started = false; // have we passed the chapter heading?

    const pushCurrent = () => {
      if (current) {
        current.md = current.lines.join("\n").trim();
        result.blocks.push(current);
        current = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Chapter heading: "# Chương X: TITLE"
      const chMatch = /^#\s+(Chương\s+[^\n:]+):?\s*(.*)$/i.exec(line);
      if (chMatch && !result.chapterHeading) {
        result.chapterHeading = chMatch[1].trim();
        result.chapterTitle = (chMatch[2] || "").trim();
        started = true;
        continue;
      }

      // "Mục N: ..." section heading -> divider block.
      const mucMatch = /^##\s+(Mục\s+.+)$/i.exec(line);
      if (mucMatch) {
        pushCurrent();
        result.blocks.push({ type: "muc", title: mucMatch[1].trim() });
        continue;
      }

      // "## Điều N. Title" -> start a new article block.
      const dieuMatch = /^##\s+Điều\s+(\d+)\.?\s*(.*)$/i.exec(line);
      if (dieuMatch) {
        pushCurrent();
        current = {
          type: "dieu",
          dieu: parseInt(dieuMatch[1], 10),
          title: (dieuMatch[2] || "").trim(),
          lines: [line], // include the heading line in the raw body
        };
        continue;
      }

      if (current) {
        current.lines.push(line);
      } else if (!started) {
        result.intro.push(line); // pre-heading lines (rare)
      } else {
        // Intro lines between chapter heading and first Điều (blockquote/source).
        result.intro.push(line);
      }
    }
    pushCurrent();
    return result;
  }

  function renderChapter(chMeta, rawMd, container) {
    const parsed = splitChapter(rawMd);

    // Chapter wrapper.
    const chSection = el("section", {
      class: "chapter",
      id: "chuong-" + slugRoman(chMeta.roman),
      "data-file": chMeta.file,
      "data-roman": chMeta.roman,
    });

    // Chapter <h1>.
    const headingText =
      (parsed.chapterHeading || "Chương " + chMeta.roman) +
      (chMeta.title ? ": " + chMeta.title : parsed.chapterTitle ? ": " + parsed.chapterTitle : "");
    chSection.appendChild(el("h1", { class: "chapter-title", text: headingText }));

    // Optional chapter intro (source note / blockquote).
    const introMd = parsed.intro.join("\n").trim();
    if (introMd) {
      chSection.appendChild(
        el("div", { class: "chapter-intro", html: renderMarkdown(introMd) })
      );
    }

    // Blocks: Mục dividers + article sections.
    parsed.blocks.forEach((block) => {
      if (block.type === "muc") {
        chSection.appendChild(
          el("div", { class: "muc-divider", text: block.title })
        );
        return;
      }

      // Article section.
      const bodyMd = block.md;
      const bodyText = markdownToPlain(bodyMd);
      const wordCount = countWords(bodyText);

      const section = el("section", {
        class: "article",
        "data-dieu": String(block.dieu),
      });

      // Gutter: checkbox + per-article 🔗 link.
      const gutter = el("div", { class: "article-gutter" });
      const cb = el("input", {
        type: "checkbox",
        class: "article-checkbox",
        "aria-label": "Chọn Điều " + block.dieu,
      });
      cb.dataset.dieu = String(block.dieu);
      cb.addEventListener("change", () => {
        setArticleSelected(block.dieu, cb.checked);
      });

      const copyLink = el("button", {
        type: "button",
        class: "article-copylink",
        title: "Sao chép liên kết điều này",
        "aria-label": "Sao chép liên kết Điều " + block.dieu,
        text: "🔗",
      });
      copyLink.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        LuatUI.copyText(articleUrl(chMeta.file, block.dieu)).then(() =>
          LuatUI.toast("Đã sao chép liên kết Điều " + block.dieu)
        );
      });

      gutter.appendChild(cb);
      gutter.appendChild(copyLink);

      // Rendered body (heading h2#dieu-N is produced by the renderer override).
      const body = el("div", {
        class: "article-body",
        html: renderMarkdown(bodyMd),
      });

      section.appendChild(gutter);
      section.appendChild(body);
      chSection.appendChild(section);

      // Index the article.
      const record = {
        dieu: block.dieu,
        title: block.title,
        chRoman: chMeta.roman,
        file: chMeta.file,
        bodyMarkdown: bodyMd,
        bodyText: bodyText,
        wordCount: wordCount,
        el: section,
        bodyEl: body,
        checkbox: cb,
      };
      articles.push(record);
      articleByDieu.set(block.dieu, record);
    });

    container.appendChild(chSection);
  }

  /* =======================================================================
   * SCROLLSPY — highlight current chapter in sidebar
   * ===================================================================== */

  function setupScrollspy() {
    const chapterSections = $$(".chapter");
    if (!chapterSections.length) return;

    // Track visibility; pick topmost visible chapter as "current".
    const visible = new Map();
    const headerOffset = 160; // approx sticky header + search height

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
          else visible.delete(entry.target);
        });
        updateActiveChapter(chapterSections, headerOffset);
      },
      { rootMargin: `-${headerOffset}px 0px -55% 0px`, threshold: [0, 0.01, 0.25, 0.5] }
    );

    chapterSections.forEach((s) => obs.observe(s));
    // Also recompute on scroll end for robustness on small chapters.
    window.addEventListener("scroll", throttle(() => updateActiveChapter(chapterSections, headerOffset), 150), { passive: true });
    updateActiveChapter(chapterSections, headerOffset);
  }

  function updateActiveChapter(chapterSections, headerOffset) {
    // Choose the last chapter whose top is above the offset line (i.e. the
    // chapter currently occupying the reading area).
    let active = chapterSections[0];
    for (const sec of chapterSections) {
      const top = sec.getBoundingClientRect().top;
      if (top - headerOffset <= 1) active = sec;
      else break;
    }
    if (!active) return;

    const file = active.getAttribute("data-file");
    currentChapterFile = file;

    $$(".chap-item").forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-file") === file);
    });
  }

  /* =======================================================================
   * SEARCH
   * ===================================================================== */

  let searchActiveIndex = -1; // index of highlighted dropdown item

  function setupSearch() {
    const input = $("#search-input");
    const results = $("#search-results");
    if (!input || !results) return;

    const run = debounce(() => doSearch(input.value), 120);

    input.addEventListener("input", () => {
      run();
    });

    input.addEventListener("keydown", (e) => {
      const items = $$(".search-result-item", results);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!items.length) return;
        searchActiveIndex = Math.min(searchActiveIndex + 1, items.length - 1);
        updateSearchActive(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        searchActiveIndex = Math.max(searchActiveIndex - 1, 0);
        updateSearchActive(items);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const active = items[searchActiveIndex] || items[0];
        if (active) {
          active.click();
        } else {
          // No dropdown items: if query is a pure number, jump there.
          const num = parseNumberQuery(input.value);
          if (num != null) gotoNumber(num);
        }
      } else if (e.key === "Escape") {
        closeDropdown();
        input.blur();
      }
    });

    // Close dropdown on outside click.
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-box")) closeDropdown();
    });
    input.addEventListener("focus", () => {
      if (input.value.trim()) doSearch(input.value);
    });
  }

  function parseNumberQuery(q) {
    const t = (q || "").trim();
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (articleByDieu.has(n)) return n;
    }
    return null;
  }

  function doSearch(query) {
    const results = $("#search-results");
    const input = $("#search-input");
    const q = (query || "").trim();

    clearHighlights(); // remove any previous body highlights on new query

    if (!q) {
      closeDropdown();
      return;
    }

    // Pure-number query -> single "Điều N" result (and live scroll target).
    const num = parseNumberQuery(q);
    let matches;
    if (num != null) {
      const a = articleByDieu.get(num);
      matches = a ? [a] : [];
    } else {
      const nq = normalize(q);
      // Filter manifest.articles by title OR keywords (accent-insensitive).
      const source = manifestArticles();
      matches = source.filter((a) => {
        return (
          normalize(a.title).includes(nq) ||
          normalize(a.keywords || "").includes(nq) ||
          normalize("điều " + a.dieu).includes(nq) ||
          String(a.dieu) === nq
        );
      });
    }

    renderResults(matches, q, num != null);
  }

  // Prefer manifest.articles (has keywords); fall back to parsed articles.
  function manifestArticles() {
    if (manifest && Array.isArray(manifest.articles) && manifest.articles.length) {
      return manifest.articles;
    }
    return articles.map((a) => ({
      dieu: a.dieu,
      title: a.title,
      keywords: "",
      file: a.file,
      chRoman: a.chRoman,
    }));
  }

  function renderResults(matches, query, isNumber) {
    const results = $("#search-results");
    const input = $("#search-input");
    results.innerHTML = "";
    searchActiveIndex = -1;

    if (!matches.length) {
      results.appendChild(el("div", { class: "search-empty", text: "Không tìm thấy kết quả." }));
      openDropdown();
      return;
    }

    matches.slice(0, 50).forEach((a, idx) => {
      const item = el("div", {
        class: "search-result-item",
        role: "option",
        tabindex: "-1",
      });
      item.dataset.dieu = String(a.dieu);
      item.appendChild(el("span", { class: "result-badge", text: "Điều " + a.dieu }));
      item.appendChild(el("span", { class: "result-title", text: a.title || "" }));
      item.addEventListener("click", () => {
        openResult(a.dieu, isNumber ? null : query);
        if (input) input.value = isNumber ? String(a.dieu) : input.value;
      });
      item.addEventListener("mouseenter", () => {
        searchActiveIndex = idx;
        updateSearchActive($$(".search-result-item", results));
      });
      results.appendChild(item);
    });

    openDropdown();
  }

  function updateSearchActive(items) {
    items.forEach((it, i) => {
      const on = i === searchActiveIndex;
      it.classList.toggle("active", on);
      if (on) it.scrollIntoView({ block: "nearest" });
    });
  }

  function openResult(dieu, query) {
    closeDropdown();
    scrollToArticle(dieu, true);
    if (query) highlightInArticle(dieu, query);
  }

  function gotoNumber(n) {
    closeDropdown();
    scrollToArticle(n, true);
  }

  function openDropdown() {
    const results = $("#search-results");
    const input = $("#search-input");
    if (results) results.hidden = false;
    if (input) input.setAttribute("aria-expanded", "true");
  }
  function closeDropdown() {
    const results = $("#search-results");
    const input = $("#search-input");
    if (results) results.hidden = true;
    if (input) input.setAttribute("aria-expanded", "false");
    searchActiveIndex = -1;
  }

  /* ---- In-article highlighting ---------------------------------------- */

  let highlightedArticle = null;

  function clearHighlights() {
    if (!highlightedArticle) return;
    const a = articleByDieu.get(highlightedArticle);
    if (a && a.bodyEl) {
      // Re-render the clean body from raw markdown (simplest, safe).
      a.bodyEl.innerHTML = renderMarkdown(a.bodyMarkdown);
    }
    highlightedArticle = null;
  }

  function highlightInArticle(dieu, query) {
    const a = articleByDieu.get(dieu);
    if (!a || !a.bodyEl || !query) return;
    clearHighlights();

    const nq = normalize(query);
    if (!nq) return;

    // Walk text nodes; wrap accent-insensitive matches in <mark class="hl">.
    const walker = document.createTreeWalker(a.bodyEl, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentNode && /MARK|SCRIPT|STYLE/.test(node.parentNode.nodeName)) continue;
      if (normalize(node.nodeValue).includes(nq)) targets.push(node);
    }

    targets.forEach((textNode) => {
      const text = textNode.nodeValue;
      const norm = normalize(text);
      const frag = document.createDocumentFragment();
      let pos = 0;
      let idx;
      while ((idx = norm.indexOf(nq, pos)) !== -1) {
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
        const mark = el("mark", { class: "hl" });
        mark.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(mark);
        pos = idx + nq.length;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      textNode.parentNode.replaceChild(frag, textNode);
    });

    highlightedArticle = dieu;
  }

  /* ---- Scroll + flash -------------------------------------------------- */

  function scrollToArticle(dieu, flash) {
    const target = document.getElementById("dieu-" + dieu);
    const a = articleByDieu.get(dieu);
    const scrollEl = target || (a && a.el);
    if (!scrollEl) return;
    scrollEl.scrollIntoView({ behavior: "smooth", block: "start" });
    if (flash && a && a.el) {
      a.el.classList.remove("flash");
      // Force reflow so the animation restarts even if re-triggered.
      void a.el.offsetWidth;
      a.el.classList.add("flash");
      setTimeout(() => a.el.classList.remove("flash"), 1600);
    }
  }

  function scrollToChapter(file) {
    const sec = $(`.chapter[data-file="${cssEscape(file)}"]`);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* =======================================================================
   * ARTICLE SELECTION + TOOLBAR
   * ===================================================================== */

  function setupSelection() {
    const wire = (id, fn) => {
      const b = $("#" + id);
      if (b) b.addEventListener("click", fn);
    };
    wire("btn-select-chapter", selectCurrentChapter);
    wire("btn-select-all", selectAll);
    wire("btn-deselect-all", deselectAll);
    wire("btn-copy-content", copyContent);
    wire("btn-copy-links", copyLinks);
  }

  // Set selection state of a single article (updates DOM + state).
  function setArticleSelected(dieu, on) {
    const a = articleByDieu.get(dieu);
    if (!a) return;
    if (on) selected.add(dieu);
    else selected.delete(dieu);
    if (a.checkbox) a.checkbox.checked = on;
    if (a.el) a.el.classList.toggle("selected", on);
    refreshChapterCheckboxes();
    updateToolbar();
  }

  function toggleChapterSelection(file, on) {
    articles
      .filter((a) => a.file === file)
      .forEach((a) => {
        if (on) selected.add(a.dieu);
        else selected.delete(a.dieu);
        if (a.checkbox) a.checkbox.checked = on;
        if (a.el) a.el.classList.toggle("selected", on);
      });
    refreshChapterCheckboxes();
    updateToolbar();
  }

  // Reflect each chapter checkbox as checked / indeterminate / empty.
  function refreshChapterCheckboxes() {
    $$(".chap-item").forEach((item) => {
      const file = item.getAttribute("data-file");
      const cb = $(".chap-checkbox", item);
      if (!cb) return;
      const inCh = articles.filter((a) => a.file === file);
      const sel = inCh.filter((a) => selected.has(a.dieu)).length;
      if (sel === 0) {
        cb.checked = false;
        cb.indeterminate = false;
      } else if (sel === inCh.length) {
        cb.checked = true;
        cb.indeterminate = false;
      } else {
        cb.checked = false;
        cb.indeterminate = true;
      }
    });
  }

  function selectCurrentChapter() {
    const file = currentChapterFile || (manifest.chapters[0] && manifest.chapters[0].file);
    if (!file) return;
    toggleChapterSelection(file, true);
  }

  function selectAll() {
    articles.forEach((a) => {
      selected.add(a.dieu);
      if (a.checkbox) a.checkbox.checked = true;
      if (a.el) a.el.classList.add("selected");
    });
    refreshChapterCheckboxes();
    updateToolbar();
  }

  function deselectAll() {
    selected.clear();
    articles.forEach((a) => {
      if (a.checkbox) a.checkbox.checked = false;
      if (a.el) a.el.classList.remove("selected");
    });
    refreshChapterCheckboxes();
    updateToolbar();
  }

  function selectedSorted() {
    return Array.from(selected)
      .map((d) => articleByDieu.get(d))
      .filter(Boolean)
      .sort((a, b) => a.dieu - b.dieu);
  }

  function updateToolbar() {
    const bar = $("#selection-toolbar");
    const countEl = $(".toolbar-count");
    const warnEl = $(".toolbar-warning");
    if (!bar) return;

    const list = selectedSorted();
    const n = list.length;
    const words = list.reduce((sum, a) => sum + a.wordCount, 0);

    if (countEl) {
      countEl.textContent = `Đã chọn: ${n} điều (~${formatVi(words)} từ)`;
    }
    if (warnEl) warnEl.hidden = words <= WARN_WORD_LIMIT;

    bar.hidden = n === 0;
  }

  /* =======================================================================
   * COPY OUTPUTS
   * ===================================================================== */

  function copyContent() {
    const list = selectedSorted();
    if (!list.length) {
      LuatUI.toast("Chưa chọn điều nào");
      return;
    }

    const parts = [];
    parts.push(LAW_NAME);
    parts.push("Nguồn: " + SOURCE_URL);
    parts.push(""); // blank line

    list.forEach((a) => {
      // bodyText already begins with the "Điều N. Title" line (heading hash
      // stripped by markdownToPlain). Re-prefix the canonical "## Điều" line
      // exactly as the contract requires.
      const body = stripLeadingDieuLine(a.bodyText, a.dieu);
      parts.push(`## Điều ${a.dieu}. ${a.title}`.trim());
      if (body) parts.push(body);
      parts.push(""); // blank line after each article
    });

    parts.push("Phân tích và trả lời: [câu hỏi ở đây]");

    const text = parts.join("\n");
    LuatUI.copyText(text).then(() =>
      LuatUI.toast(`Đã sao chép nội dung ${list.length} điều`)
    );
  }

  // markdownToPlain leaves the first line as "Điều N. Title"; remove it so we
  // don't duplicate the heading we re-add as "## Điều N. Title".
  function stripLeadingDieuLine(bodyText, dieu) {
    const lines = bodyText.split("\n");
    const re = new RegExp("^\\s*Điều\\s+" + dieu + "\\.?", "i");
    if (lines.length && re.test(lines[0])) {
      lines.shift();
    }
    return lines.join("\n").trim();
  }

  function copyLinks() {
    const list = selectedSorted();
    if (!list.length) {
      LuatUI.toast("Chưa chọn điều nào");
      return;
    }

    // Group selected điều by file, preserving manifest chapter order.
    const orderByFile = new Map();
    manifest.chapters.forEach((ch, i) => orderByFile.set(ch.file, i));

    const groups = new Map(); // file -> [dieu,...]
    list.forEach((a) => {
      if (!groups.has(a.file)) groups.set(a.file, []);
      groups.get(a.file).push(a.dieu);
    });

    const files = Array.from(groups.keys()).sort(
      (x, y) => (orderByFile.get(x) ?? 0) - (orderByFile.get(y) ?? 0)
    );

    const parts = [];
    parts.push(LAW_NAME);
    parts.push("Fetch các file sau và đọc các điều được chỉ định:");
    parts.push(""); // blank line

    files.forEach((file) => {
      const dieus = groups.get(file).slice().sort((a, b) => a - b);
      parts.push(chapterUrl(file));
      parts.push("→ Điều " + dieus.join(", "));
      parts.push(""); // blank line between blocks
    });

    parts.push("Phân tích và trả lời: [câu hỏi ở đây]");

    const text = parts.join("\n");
    LuatUI.copyText(text).then(() => LuatUI.toast("Đã sao chép links"));
  }

  /* =======================================================================
   * Small helpers: escaping, throttling, etc.
   * ===================================================================== */

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function stripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, "");
  }
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, "\\$&");
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments,
        ctx = this;
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }
  function throttle(fn, ms) {
    let last = 0,
      timer = null;
    return function () {
      const now = Date.now();
      const remaining = ms - (now - last);
      const args = arguments,
        ctx = this;
      if (remaining <= 0) {
        last = now;
        fn.apply(ctx, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(ctx, args);
        }, remaining);
      }
    };
  }
})();
