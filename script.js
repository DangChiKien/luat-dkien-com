/**
 * script.js — shared utilities for luat.dkien.com
 * Exposes window.LuatUI with: initTheme, copyText, toast
 */

(function () {
  'use strict';

  const THEME_KEY = 'luat-theme';
  const THEMES = { LIGHT: 'light', DARK: 'dark' };

  /* ── toast ──────────────────────────────────────────────────── */

  let _toastEl = null;
  let _toastTimer = null;

  function toast(message) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.className = 'toast';
      _toastEl.setAttribute('role', 'status');
      _toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = message;
    // force reflow so the transition runs even on rapid repeat calls
    void _toastEl.offsetWidth;
    _toastEl.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      _toastEl.classList.remove('show');
    }, 2200);
  }

  /* ── copyText ────────────────────────────────────────────────── */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // execCommand fallback
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ── initTheme ───────────────────────────────────────────────── */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function savedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function persistTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || THEMES.LIGHT;
  }

  function updateToggleLabel(btn, theme) {
    if (!btn) return;
    var isDark = theme === THEMES.DARK;
    btn.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
    btn.textContent = isDark ? '☀' : '☾';
  }

  function initTheme() {
    var theme = savedTheme() || THEMES.LIGHT;
    applyTheme(theme);

    var btn = document.getElementById('theme-toggle');
    updateToggleLabel(btn, theme);

    if (btn) {
      btn.addEventListener('click', function () {
        var next = currentTheme() === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
        applyTheme(next);
        persistTheme(next);
        updateToggleLabel(btn, next);
      });
    }
  }

  /* ── sticky header height → --header-h ───────────────────────── */
  /* The sticky top bar can change height (search wraps to a second row on
     mobile, web font swaps). Publish its real height so sidebar offset and
     article scroll-margins always match and nothing hides under the bar. */
  function syncHeaderHeight() {
    var h = document.querySelector('.site-header');
    if (h) {
      document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
    }
  }

  /* ── DOMContentLoaded wiring ─────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    LuatUI.initTheme();
    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncHeaderHeight);
    }

    document.querySelectorAll('.js-copy').forEach(function (el) {
      el.addEventListener('click', function () {
        var text = el.getAttribute('data-copy') || '';
        LuatUI.copyText(text).then(function () {
          LuatUI.toast('Đã sao chép');
        }).catch(function () {
          LuatUI.toast('Không thể sao chép');
        });
      });
    });
  });

  /* ── public API ──────────────────────────────────────────────── */

  window.LuatUI = {
    initTheme: initTheme,
    copyText: copyText,
    toast: toast
  };
}());
