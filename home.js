/**
 * home.js — home page: render the law cards from /laws.json and provide a
 * search box that jumps straight to an article in any law's reader.
 * Data-driven: add a law to /laws.json (+ its folder) and it shows up here.
 */
(function () {
  "use strict";

  var grid = document.getElementById("law-grid");
  var input = document.getElementById("search-input");
  var box = document.getElementById("search-results");

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function docType(name) {
    var m = (name || "").match(/^(Luật|Nghị định|Thông tư|Nghị quyết|Quyết định)/);
    return m ? m[0] : "Văn bản";
  }

  /* ---- law list rendering: cards | list, grouped by category ---- */
  var VIEW_KEY = "luat-law-view";
  var lawsData = [];

  function currentView() {
    try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; }
    catch (e) { return "cards"; }
  }
  function metaRow(k, v) {
    return el("div", { class: "law-card__meta-row" }, [el("dt", { text: k }), el("dd", { text: v })]);
  }
  function lawCard(l) {
    return el("a", { class: "law-card", href: "/" + l.slug + "/", "aria-label": "Đọc " + l.name + ", số hiệu " + l.code }, [
      el("div", { class: "law-card__badge", text: docType(l.name) }),
      el("h3", { class: "law-card__title", text: l.name }),
      el("dl", { class: "law-card__meta" }, [
        metaRow("Số hiệu", l.code),
        metaRow("Hiệu lực", l.effective || "—"),
        metaRow("Quy mô", l.chapters + " chương · " + l.articles + " điều")
      ]),
      el("span", { class: "law-card__cta", "aria-hidden": "true", text: "Xem toàn văn →" })
    ]);
  }
  function lawRow(l) {
    return el("a", { class: "law-row", href: "/" + l.slug + "/", "aria-label": "Đọc " + l.name + ", " + l.code }, [
      el("span", { class: "law-row__type", text: docType(l.name) }),
      el("span", { class: "law-row__name", text: l.name }),
      el("span", { class: "law-row__code", text: l.code }),
      el("span", { class: "law-row__meta", text: l.chapters + " chương · " + l.articles + " điều" })
    ]);
  }
  function renderLaws() {
    if (!grid) return;
    var view = currentView();
    grid.innerHTML = "";
    grid.className = "law-groups";
    var cats = [];
    lawsData.forEach(function (l) { if (cats.indexOf(l.category) < 0) cats.push(l.category); });
    cats.forEach(function (cat) {
      var inner = el("div", { class: view === "list" ? "law-list" : "law-grid" });
      lawsData.filter(function (l) { return l.category === cat; })
        .forEach(function (l) { inner.appendChild(view === "list" ? lawRow(l) : lawCard(l)); });
      grid.appendChild(el("section", { class: "law-cat-group" }, [
        el("h3", { class: "law-cat", text: cat }), inner
      ]));
    });
    var bc = document.getElementById("view-cards"), bl = document.getElementById("view-list");
    if (bc) bc.setAttribute("aria-pressed", String(view === "cards"));
    if (bl) bl.setAttribute("aria-pressed", String(view === "list"));
  }
  function setView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) {}
    renderLaws();
  }
  (function wireViewToggle() {
    var bc = document.getElementById("view-cards"), bl = document.getElementById("view-list");
    if (bc) bc.addEventListener("click", function () { setView("cards"); });
    if (bl) bl.addEventListener("click", function () { setView("list"); });
  })();

  /* ---- search across all laws ---- */
  var items = [];      // {dieu, title, keywords, slug, lawName}
  var current = [];
  var activeIndex = -1;

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  }

  function loadSearchIndex(laws) {
    laws.forEach(function (l) {
      fetch("/" + l.slug + "/manifest.json", { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (m) {
          if (!m || !Array.isArray(m.articles)) return;
          m.articles.forEach(function (a) {
            items.push({ dieu: a.dieu, title: a.title || "", keywords: a.keywords || "", slug: l.slug, lawName: l.name });
          });
        })
        .catch(function () {});
    });
  }

  function goTo(it) { window.location.href = "/" + it.slug + "/#dieu-" + it.dieu; }

  function close() {
    if (!box) return;
    box.hidden = true; box.innerHTML = ""; current = []; activeIndex = -1;
    if (input) input.setAttribute("aria-expanded", "false");
  }

  function render(results) {
    if (!box) return;
    box.innerHTML = ""; current = results; activeIndex = -1;
    if (!results.length) {
      box.appendChild(el("div", { class: "search-empty", text: "Không tìm thấy điều phù hợp" }));
      box.hidden = false; return;
    }
    results.forEach(function (it, i) {
      var row = el("a", { class: "search-result-item", href: "/" + it.slug + "/#dieu-" + it.dieu }, [
        el("span", { class: "result-badge", text: "Điều " + it.dieu }),
        el("span", { class: "result-title" }, [
          el("span", { text: it.title }),
          el("small", { class: "result-meta", text: " · " + it.lawName })
        ])
      ]);
      row.dataset.index = String(i);
      row.addEventListener("click", function (e) { e.preventDefault(); goTo(it); });
      box.appendChild(row);
    });
    box.hidden = false;
    if (input) input.setAttribute("aria-expanded", "true");
  }

  function search(q) {
    var query = (q || "").trim();
    if (!query) { close(); return; }
    if (/^\d+$/.test(query)) {
      var n = parseInt(query, 10);
      render(items.filter(function (it) { return it.dieu === n; }).slice(0, 40));
      return;
    }
    var nq = norm(query);
    render(items.filter(function (it) {
      return norm(it.title).indexOf(nq) !== -1 || norm(it.keywords).indexOf(nq) !== -1;
    }).slice(0, 40));
  }

  function setActive(i) {
    var rows = box.querySelectorAll(".search-result-item");
    if (!rows.length) return;
    activeIndex = (i + rows.length) % rows.length;
    rows.forEach(function (r, idx) { r.classList.toggle("active", idx === activeIndex); });
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  }

  if (input && box) {
    input.addEventListener("input", function () { search(input.value); });
    input.addEventListener("keydown", function (e) {
      if (box.hidden) {
        if (e.key === "Enter" && /^\d+$/.test(input.value.trim())) search(input.value);
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && current[activeIndex]) goTo(current[activeIndex]);
        else if (current.length) goTo(current[0]);
      } else if (e.key === "Escape") { close(); input.blur(); }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".topbar-search")) close();
    });
  }

  /* ---- boot ---- */
  fetch("/laws.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (laws) {
      lawsData = laws;
      renderLaws();
      loadSearchIndex(laws);
    })
    .catch(function () {
      if (grid) grid.appendChild(el("p", { class: "load-error", text: "Không tải được danh sách văn bản." }));
    });
})();
