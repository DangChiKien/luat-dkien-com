/**
 * luat-worker.js — Cloudflare Worker
 * Vietnamese legal Q&A backend for luat.dkien.com.
 *
 * Flow (RAG, retrieve-then-answer):
 *   1. Load the compact article index from the static site (Cloudflare-cached).
 *   2. Ask Claude Haiku to pick the relevant articles (JSON).
 *   3. Fetch the full text of those articles from the site.
 *   4. Ask Claude Haiku to answer, grounded in that text, with citations.
 *      The answer is streamed back to the browser as plain text chunks.
 *
 * The Anthropic API key lives in the Worker secret ANTHROPIC_API_KEY and is
 * never exposed to the browser. Configure it with:
 *   wrangler secret put ANTHROPIC_API_KEY     (or via the dashboard UI)
 *
 * Deploy: paste this file into a Cloudflare Worker (dashboard → Create Worker),
 * add the ANTHROPIC_API_KEY secret, and put the Worker URL into the site's ask.js.
 */

const SITE = "https://luat.dkien.com";
const MODEL = "claude-haiku-4-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

const ALLOWED_ORIGINS = ["https://luat.dkien.com", "http://localhost:3000"];
const MAX_QUESTION_CHARS = 600;
const MAX_ARTICLES = 8;        // most articles we feed into the answer
const MAX_ANSWER_TOKENS = 1200;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Chỉ hỗ trợ POST." }, 405, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Server chưa cấu hình API key." }, 500, cors);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "Dữ liệu gửi lên không hợp lệ." }, 400, cors); }

    const question = String(payload.question || "").trim();
    if (!question) return json({ error: "Vui lòng nhập câu hỏi." }, 400, cors);
    if (question.length > MAX_QUESTION_CHARS) return json({ error: "Câu hỏi quá dài (tối đa 600 ký tự)." }, 400, cors);

    try {
      const index = await loadIndex();                       // [{s,c,n,d,t,f,k}]
      const picks = await retrieve(env, question, index);    // [{s,d}]
      const context = await fetchContext(picks, index);      // {text, cites:[...]}
      if (!context.text) {
        return json({
          error: "Không tìm thấy điều luật phù hợp trong kho. Hãy thử diễn đạt lại câu hỏi.",
        }, 200, cors);
      }
      return await answerStream(env, question, context, cors);
    } catch (e) {
      return json({ error: "Lỗi xử lý: " + (e && e.message ? e.message : String(e)) }, 500, cors);
    }
  },
};

/* ---------------- CORS ---------------- */
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

/* ---------------- 1. Load index (CF edge-cached) ---------------- */
async function loadIndex() {
  const res = await fetch(SITE + "/search-index.json", { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("không tải được chỉ mục");
  return res.json();
}

/* ---------------- 2. Retrieve relevant articles ---------------- */
async function retrieve(env, question, index) {
  // Compact catalog: one line per article. Cached in the system prompt.
  const catalog = index.map(a => `${a.s}|${a.d}|${a.t}|${a.k}`).join("\n");
  const system = [
    {
      type: "text",
      text:
        "Bạn là bộ định tuyến tra cứu pháp luật Việt Nam. Dưới đây là DANH MỤC điều luật, mỗi dòng: " +
        "slug|số_điều|tên_điều|từ_khóa.\n\n" + catalog,
      cache_control: { type: "ephemeral" },
    },
  ];
  const user =
    "Câu hỏi: " + question + "\n\n" +
    "Chọn TỐI ĐA " + MAX_ARTICLES + " điều liên quan nhất để trả lời. " +
    'Chỉ trả về JSON dạng: {"picks":[{"s":"slug","d":"số điều"}]} — không giải thích, không markdown.';

  const data = await callClaude(env, {
    model: MODEL,
    max_tokens: 400,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = extractText(data);
  const obj = safeJson(text);
  const picks = (obj && Array.isArray(obj.picks)) ? obj.picks : [];
  // normalize + clamp
  const seen = new Set();
  const out = [];
  for (const p of picks) {
    const key = p.s + "#" + p.d;
    if (p.s && p.d != null && !seen.has(key)) { seen.add(key); out.push({ s: String(p.s), d: String(p.d) }); }
    if (out.length >= MAX_ARTICLES) break;
  }
  return out;
}

/* ---------------- 3. Fetch the picked articles' full text ---------------- */
async function fetchContext(picks, index) {
  const byKey = {};
  for (const a of index) byKey[a.s + "#" + a.d] = a;

  // group picks by file to minimise fetches
  const files = {}; // "slug/file" -> {slug, file, dieus:Set}
  for (const p of picks) {
    const meta = byKey[p.s + "#" + p.d];
    if (!meta) continue;
    const fk = p.s + "/" + meta.f;
    (files[fk] = files[fk] || { slug: p.s, file: meta.f, name: meta.n, code: meta.c, dieus: new Set() }).dieus.add(p.d);
  }

  const parts = [];
  const cites = [];
  for (const fk of Object.keys(files)) {
    const g = files[fk];
    const res = await fetch(`${SITE}/${g.slug}/${g.file}`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!res.ok) continue;
    const md = await res.text();
    const articles = splitArticles(md); // { "57": "## Điều 57. ...\n..." }
    for (const d of g.dieus) {
      const body = articles[String(d)];
      if (!body) continue;
      parts.push(`Văn bản: ${g.name} (${g.code})\n${body.trim()}`);
      cites.push({ name: g.name, dieu: d, url: `${SITE}/${g.slug}/${g.file}#dieu-${d}` });
    }
  }
  return { text: parts.join("\n\n---\n\n"), cites };
}

// split a chapter markdown into { dieuId: "## Điều N. Title\n<body>" }
function splitArticles(md) {
  const out = {};
  // manual line scan: start a new article at each "## Điều N", close it at the
  // next "## Điều" or any "# " (chapter / appendix) heading.
  const lines = md.split(/\r?\n/);
  let cur = null, buf = [];
  for (const ln of lines) {
    const h = /^##\s+Điều\s+(\d+[a-zđ]*)\b/i.exec(ln);
    if (h) { if (cur) out[cur] = buf.join("\n"); cur = h[1].toLowerCase(); buf = [ln]; }
    else if (/^#\s+/.test(ln) && cur) { out[cur] = buf.join("\n"); cur = null; buf = []; }
    else if (cur) buf.push(ln);
  }
  if (cur) out[cur] = buf.join("\n");
  return out;
}

/* ---------------- 4. Answer (streamed) ---------------- */
async function answerStream(env, question, context, cors) {
  const system = [
    {
      type: "text",
      text:
        "Bạn là trợ lý pháp luật Việt Nam của luat.dkien.com. Trả lời bằng tiếng Việt, rõ ràng, " +
        "CHỈ DỰA TRÊN các điều luật được cung cấp. Luôn TRÍCH DẪN số điều và tên văn bản khi nêu căn cứ " +
        "(ví dụ: theo Điều 57 Luật Nhà ở 2023). Nếu các điều được cung cấp không đủ căn cứ, hãy nói rõ là " +
        "chưa đủ thông tin thay vì suy đoán. Kết thúc bằng một dòng lưu ý: " +
        '"⚠ Thông tin chỉ mang tính tham khảo; vui lòng đối chiếu văn bản gốc."',
      cache_control: { type: "ephemeral" },
    },
  ];
  const user =
    "CÂU HỎI:\n" + question + "\n\n" +
    "CÁC ĐIỀU LUẬT LIÊN QUAN (nguyên văn):\n\n" + context.text;

  const upstream = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_ANSWER_TOKENS,
      stream: true,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return json({ error: "Lỗi gọi mô hình AI. " + errText.slice(0, 200) }, 502, cors);
  }

  // Transform Anthropic SSE → plain UTF-8 text chunks for the browser.
  const stream = sseToText(upstream.body, context.cites);
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...cors },
  });
}

function sseToText(body, cites) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch { /* ignore keepalive / partial */ }
          }
        }
        // Append a sources block the frontend can render.
        if (cites && cites.length) {
          const lines = cites.map(c => `• ${c.name} — Điều ${c.dieu}: ${c.url}`).join("\n");
          controller.enqueue(encoder.encode("\n\n SOURCES \n" + lines));
        }
      } catch (e) {
        controller.enqueue(encoder.encode("\n\n[Lỗi truyền dữ liệu]"));
      } finally {
        controller.close();
      }
    },
  });
}

/* ---------------- Anthropic non-stream call ---------------- */
async function callClaude(env, reqBody) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("AI " + res.status + " " + t.slice(0, 160));
  }
  return res.json();
}
function extractText(data) {
  if (!data || !Array.isArray(data.content)) return "";
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
}
function safeJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text && text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
