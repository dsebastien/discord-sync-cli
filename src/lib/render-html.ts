/** Rendering exports as plain, readable HTML (Tailwind CDN, mono font). */

import { IMAGE_EXTS, extOf, urlKey } from './assets'
import { discordUrl } from './core'
import type { DceExport, DceMessage, Manifest } from './types'

export function escapeHtml(s: string): string {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

export function localAsset(url: string, manifest: Manifest): string | null {
    const entry = manifest[urlKey(url)]
    return entry?.file ? `../_assets/${encodeURIComponent(entry.file)}` : null
}

/** Only http(s) and our own local asset paths are safe as hrefs/srcs; anything
 * else (javascript:, data:, etc.) is dropped. Discord content is untrusted. */
export function safeUrl(url: string): string | null {
    if (url.startsWith('../_assets/')) return url
    try {
        const u = new URL(url)
        return u.protocol === 'http:' || u.protocol === 'https:' ? url : null
    } catch {
        return null
    }
}

/** A URL escaped for use inside a double-quoted HTML attribute. */
function attr(url: string): string {
    return escapeHtml(url)
}

const URL_RE = /https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/g
const FENCE_RE = /```(?:\w+\n|\n)?([\s\S]*?)```/g

function emphasize(escaped: string): string {
    return escaped
        .replace(/`([^`\n]+)`/g, '<code class="bg-gray-100 rounded px-1">$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
}

function inline(text: string): string {
    // Tokenize URLs on the RAW text first, so escaping never bleeds into the
    // href (previously `<https://x>` produced an href ending in `&gt`).
    const out: string[] = []
    let pos = 0
    for (const m of text.matchAll(URL_RE)) {
        out.push(emphasize(escapeHtml(text.slice(pos, m.index))))
        const raw = m[0]
        const safe = safeUrl(raw)
        if (safe) {
            out.push(
                `<a class="text-blue-700 underline break-all" href="${attr(safe)}">${escapeHtml(raw)}</a>`
            )
        } else {
            out.push(escapeHtml(raw))
        }
        pos = m.index + raw.length
    }
    out.push(emphasize(escapeHtml(text.slice(pos))))
    return out.join('')
}

/** Minimal, safe rendering: escape first, then code fences, inline code,
 * bold, and clickable links. Whitespace is preserved by CSS. */
export function renderMarkdown(text: string): string {
    const out: string[] = []
    let pos = 0
    for (const m of text.matchAll(FENCE_RE)) {
        out.push(inline(text.slice(pos, m.index)))
        const code = escapeHtml(m[1]!.replace(/^\n+|\n+$/g, ''))
        out.push(
            `<pre class="bg-gray-100 rounded p-3 my-2 overflow-x-auto text-[13px]">${code}</pre>`
        )
        pos = m.index! + m[0].length
    }
    out.push(inline(text.slice(pos)))
    return out.join('')
}

export function renderMessage(msg: DceMessage, manifest: Manifest, baseUrl = ''): string {
    const author = escapeHtml(msg.author?.name ?? 'unknown')
    const ts = escapeHtml((msg.timestamp ?? '').slice(0, 16).replace('T', ' '))
    const mid = msg.id ?? ''
    const tsHtml = baseUrl
        ? `<a class="hover:underline" href="${attr(`${baseUrl}/${mid}`)}" title="open in Discord">${ts} UTC</a>`
        : `${ts} UTC`
    const parts = [
        `<div class="mt-6" id="msg-${mid}">`,
        `<div class="text-xs text-gray-500"><span class="font-bold text-gray-800">${author}</span> · ${tsHtml}</div>`
    ]

    if (msg.content) {
        parts.push(
            `<div class="whitespace-pre-wrap break-words mt-1">${renderMarkdown(msg.content)}</div>`
        )
    }

    for (const att of msg.attachments ?? []) {
        const url = att.url ?? ''
        const href = safeUrl(localAsset(url, manifest) ?? url)
        const name = escapeHtml(att.fileName ?? 'attachment')
        if (!href) continue
        if (IMAGE_EXTS.has(extOf(url))) {
            parts.push(
                `<a href="${attr(href)}"><img src="${attr(href)}" alt="${name}" loading="lazy" class="mt-2 rounded border border-gray-200 max-w-full"></a>`
            )
        } else {
            parts.push(
                `<div class="mt-1"><a class="text-blue-700 underline" href="${attr(href)}">📎 ${name}</a></div>`
            )
        }
    }

    for (const emb of msg.embeds ?? []) {
        const eparts: string[] = []
        if (emb.title) {
            let title = escapeHtml(emb.title)
            const titleHref = emb.url ? safeUrl(emb.url) : null
            if (titleHref) title = `<a class="underline" href="${attr(titleHref)}">${title}</a>`
            eparts.push(`<div class="font-bold">${title}</div>`)
        }
        if (emb.description) {
            eparts.push(
                `<div class="whitespace-pre-wrap mt-1">${renderMarkdown(emb.description)}</div>`
            )
        }
        for (const part of ['image', 'thumbnail'] as const) {
            const url = emb[part]?.url
            const href = url ? safeUrl(localAsset(url, manifest) ?? url) : null
            if (href) {
                eparts.push(
                    `<a href="${attr(href)}"><img src="${attr(href)}" loading="lazy" class="mt-2 rounded max-w-full"></a>`
                )
            }
        }
        if (eparts.length) {
            parts.push(
                `<div class="mt-2 border-l-4 border-gray-300 pl-3 text-gray-700">${eparts.join('')}</div>`
            )
        }
    }

    const reactions = msg.reactions ?? []
    if (reactions.length) {
        const chips = reactions
            .map(
                (r) =>
                    `<span class="inline-block bg-gray-100 rounded px-2 py-0.5 text-xs">${escapeHtml(r.emoji?.name ?? '?')} ${r.count ?? 0}</span>`
            )
            .join(' ')
        parts.push(`<div class="mt-2">${chips}</div>`)
    }

    parts.push('</div>')
    return parts.join('')
}

const EXPLORED_JS = `
// "Explored" state lives in localStorage under one key, mapping
// thread ID -> ISO date. Thread IDs are stable across regenerations.
var KEY = "discord-sync-explored";
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function save(st) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
}
function toggle(tid) {
  var st = load();
  if (st[tid]) { delete st[tid]; } else { st[tid] = new Date().toISOString().slice(0, 10); }
  save(st);
  paint();
}
function paint() {
  var st = load();
  document.querySelectorAll("[data-thread-id]").forEach(function (el) {
    var tid = el.getAttribute("data-thread-id");
    var on = !!st[tid];
    el.querySelectorAll(".explored-btn").forEach(function (btn) {
      btn.textContent = on ? "\\u2713 Explored (" + st[tid] + ")" : "Mark as explored";
      btn.className = "explored-btn text-xs rounded px-2 py-1 border " +
        (on ? "bg-green-100 border-green-300 text-green-800"
            : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100");
    });
    el.querySelectorAll(".explored-row").forEach(function (row) {
      row.classList.toggle("opacity-40", on);
      row.classList.toggle("line-through", on);
    });
  });
  var c = document.getElementById("explored-count");
  if (c) { c.textContent = Object.keys(st).length + " explored"; }
}
function exportState() {
  var a = document.createElement("a");
  a.href = "data:application/json," + encodeURIComponent(JSON.stringify(load(), null, 2));
  a.download = "explored-state.json";
  a.click();
}
function importState(input) {
  var f = input.files && input.files[0];
  if (!f) { return; }
  f.text().then(function (txt) {
    try {
      var incoming = JSON.parse(txt), st = load();
      Object.keys(incoming).forEach(function (k) { st[k] = incoming[k]; });
      save(st); paint();
    } catch (e) { console.log("import failed", e); }
  });
}
document.addEventListener("DOMContentLoaded", paint);
`

export function renderPage(title: string, body: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-gray-900 font-mono text-[15px] leading-relaxed">
<div class="max-w-3xl mx-auto px-4 py-8">
${body}
</div>
<script>${EXPLORED_JS}</script>
</body>
</html>
`
}

export function threadPage(data: DceExport, manifest: Manifest): string {
    const ch = data.channel ?? {}
    const guild = data.guild?.name ?? ''
    const title = ch.name ?? 'thread'
    const tid = ch.id ?? ''
    const gid = data.guild?.id ?? ''
    const baseUrl = gid && tid ? discordUrl(gid, tid) : ''
    const msgs = data.messages ?? []
    const link = baseUrl
        ? ` <a class="text-xs text-blue-700 underline ml-2" href="${baseUrl}">open in Discord ↗</a>`
        : ''
    const header =
        `<div data-thread-id="${tid}">` +
        `<a class="text-sm text-blue-700 underline" href="index.html">&larr; index</a>` +
        `<h1 class="text-xl font-bold mt-2">${escapeHtml(title)}</h1>` +
        `<div class="text-xs text-gray-500 mt-1">${escapeHtml(guild)} / ${escapeHtml(ch.category ?? '')} · ${msgs.length} messages · thread ${tid}</div>` +
        `<button class="explored-btn mt-2" onclick="toggle('${tid}')">Mark as explored</button>${link}` +
        `</div><hr class="my-4 border-gray-200">`
    return renderPage(title, header + msgs.map((m) => renderMessage(m, manifest, baseUrl)).join(''))
}

export interface IndexEntry {
    name: string
    file: string
    count: number
    last: string
    tid: string
}

export function indexPage(dirName: string, entries: IndexEntry[]): string {
    const sorted = [...entries].sort((a, b) => (a.last < b.last ? 1 : -1))
    const rows = sorted
        .map(
            (e) =>
                `<tr class="border-b border-gray-100 align-top" data-thread-id="${e.tid}">` +
                `<td class="py-2 pr-4 explored-row"><a class="text-blue-700 underline" href="${encodeURIComponent(e.file)}">${escapeHtml(e.name)}</a></td>` +
                `<td class="py-2 pr-4 text-right text-gray-600">${e.count}</td>` +
                `<td class="py-2 pr-4 text-gray-600 whitespace-nowrap">${e.last}</td>` +
                `<td class="py-2 whitespace-nowrap"><button class="explored-btn" onclick="toggle('${e.tid}')">Mark as explored</button></td></tr>`
        )
        .join('')
    const body =
        `<h1 class="text-xl font-bold">${escapeHtml(dirName)}</h1>` +
        `<div class="text-xs text-gray-500 mt-1">${entries.length} threads · ` +
        `<span id="explored-count">0 explored</span> · ` +
        `<button class="underline" onclick="exportState()">export state</button> · ` +
        `<label class="underline cursor-pointer">import state` +
        `<input type="file" accept=".json" class="hidden" onchange="importState(this)"></label></div>` +
        `<table class="mt-4 w-full text-sm"><thead><tr class="text-left text-xs text-gray-500 border-b border-gray-300">` +
        `<th class="py-2 pr-4">thread</th><th class="py-2 pr-4 text-right">msgs</th><th class="py-2 pr-4">last</th><th class="py-2"></th></tr>` +
        `</thead><tbody>${rows}</tbody></table>`
    return renderPage(dirName, body)
}
