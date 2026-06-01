/**
 * home.js — home-page search.
 * Loads the law manifest(s) and lets the user jump straight to an article in
 * the reader (luat-nha-o-2023/#dieu-N) without scrolling. Reuses the same
 * dropdown markup/classes as the reader so styling is shared.
 */
(function () {
  "use strict";

  // Documents available on the home page. Add a row here when a new law lands.
  var DOCS = [
    { slug: "luat-nha-o-2023", label: "Luật Nhà ở 2023" }
  ];

  var input = document.getElementById("search-input");
  var box = document.getElementById("search-results");
  if (!input || !box) return;

  var items = []; // { dieu, title, keywords, slug, label }
  var activeIndex = -1;
  var current = []; // current result set

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d");
  }

  // Load every document's manifest.
  DOCS.forEach(function (doc) {
    fetch("./" + doc.slug + "/manifest.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m || !Array.isArray(m.articles)) return;
        m.articles.forEach(function (a) {
          items.push({
            dieu: a.dieu,
            title: a.title || "",
            keywords: a.keywords || "",
            slug: doc.slug,
            label: doc.label
          });
        });
      })
      .catch(function () { /* offline / missing manifest: search just stays empty */ });
  });

  function goTo(item) {
    window.location.href = "./" + item.slug + "/#dieu-" + item.dieu;
  }

  function close() {
    box.hidden = true;
    box.innerHTML = "";
    activeIndex = -1;
    current = [];
    input.setAttribute("aria-expanded", "false");
  }

  function render(results, isNumber) {
    box.innerHTML = "";
    current = results;
    activeIndex = -1;
    if (!results.length) {
      var empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "Không tìm thấy điều phù hợp";
      box.appendChild(empty);
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }
    results.forEach(function (item, i) {
      var row = document.createElement("a");
      row.className = "search-result-item";
      row.href = "./" + item.slug + "/#dieu-" + item.dieu;
      row.dataset.index = String(i);

      var badge = document.createElement("span");
      badge.className = "result-badge";
      badge.textContent = "Điều " + item.dieu;

      var title = document.createElement("span");
      title.className = "result-title";
      title.textContent = item.title;

      row.appendChild(badge);
      row.appendChild(title);
      row.addEventListener("click", function (e) {
        e.preventDefault();
        goTo(item);
      });
      box.appendChild(row);
    });
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function search(q) {
    var query = q.trim();
    if (!query) { close(); return; }

    // Pure number -> the matching Điều across all docs.
    if (/^\d+$/.test(query)) {
      var n = parseInt(query, 10);
      render(items.filter(function (it) { return it.dieu === n; }), true);
      return;
    }

    var nq = norm(query);
    var matches = items.filter(function (it) {
      return norm(it.title).indexOf(nq) !== -1 || norm(it.keywords).indexOf(nq) !== -1;
    }).slice(0, 30);
    render(matches, false);
  }

  function setActive(i) {
    var rows = box.querySelectorAll(".search-result-item");
    if (!rows.length) return;
    activeIndex = (i + rows.length) % rows.length;
    rows.forEach(function (r, idx) {
      r.classList.toggle("active", idx === activeIndex);
    });
    rows[activeIndex].scrollIntoView({ block: "nearest" });
  }

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
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });

  // Close when clicking outside the search box.
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".topbar-search")) close();
  });
})();
