/* ===== Расчёт: чистые функции (без DOM) ===== */
const VC = (() => {
  const pint = (v, d = 1) => { const m = String(v ?? "").match(/^\s*([-+]?\d+)/); return m ? parseInt(m[1], 10) : d; };

  /* --- геометрия экранов так же, как в LED Pixel Mask Generator --- */
  const SHAPED = { "1/4": 0.25, "1/2": 0.5 };
  function shapedPx(st, v) {
    if (typeof v === "string") return SHAPED[v] ? Math.max(1, Math.round(Math.max(1, st.cabWpx) * SHAPED[v])) : 0;
    v = +v; return v > 0 ? v : 0;
  }
  function screenDims(st) {
    if (st.kind === "proj") {
      const P = st.proj || {}, pw = Math.max(16, pint(P.pw, 1920)), ph = Math.max(16, pint(P.ph, 1200));
      const nx = Math.max(1, pint(P.nx, 1)), ny = Math.max(1, pint(P.ny, 1));
      const ox = Math.max(0, Math.min(50, +(P.ox ?? 15) || 0)), oy = Math.max(0, Math.min(50, +(P.oy ?? 15) || 0));
      const ovx = nx > 1 ? Math.round(pw * ox / 100) : 0, ovy = ny > 1 ? Math.round(ph * oy / 100) : 0;
      return { w: nx * pw - (nx - 1) * ovx, h: ny * ph - (ny - 1) * ovy, proj: { pw, ph, nx, ny, ovx, ovy } };
    }
    const cw = Math.max(1, pint(st.cabWpx, 192)), ch = Math.max(1, pint(st.cabHpx, 192));
    const cols = Math.max(1, pint(st.cabCols, 1)), rows = Math.max(1, pint(st.cabRows, 1));
    const sc = st.shapedCols || {}, sr = st.shapedRows || {};
    let w = 0, h = 0;
    for (let c = 0; c < cols; c++) w += shapedPx({ cabWpx: cw }, sc[c]) || cw;
    for (let r = 0; r < rows; r++) h += (+sr[r] > 0 ? +sr[r] : ch);
    return { w, h };
  }
  const evenUp = (v) => { v = Math.ceil(v - 1e-9); return v % 2 ? v + 1 : v; };
  function rotDims(w, h, rot) {
    const a = rot * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return [Math.round(w * c + h * s), Math.round(w * s + h * c)];
  }

  /* --- разбор проекта .ledmask (JSON веб-версии или plist Mac/Windows) --- */
  function parsePlist(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("файл повреждён");
    const conv = (el) => {
      switch (el.tagName) {
        case "dict": { const o = {}, k = [...el.children]; for (let i = 0; i < k.length; i += 2) o[k[i].textContent] = conv(k[i + 1]); return o; }
        case "array": return [...el.children].map(conv);
        case "integer": return parseInt(el.textContent, 10);
        case "real": return parseFloat(el.textContent);
        case "true": return true;
        case "false": return false;
        default: return el.textContent;
      }
    };
    return conv(doc.querySelector("plist > *"));
  }
  function parseProjectText(text) {
    return /^\s*(<\?xml|<!DOCTYPE plist|<plist)/.test(text) ? parsePlist(text) : JSON.parse(text);
  }
  /* Возвращает экраны и поля проекта и то, что по умолчанию войдёт в ТЗ */
  function projectItems(d) {
    const raw = (Array.isArray(d.screens) ? d.screens : [d]).filter((x) => x && typeof x === "object");
    const screens = raw.map((s, i) => ({ uid: String(s.uid || "s" + i), name: String(s.name ?? "screen " + (i + 1)), kind: s.kind === "proj" ? "proj" : "led", st: s, ...screenDims(s) }));
    let fields = Array.isArray(d.fields) ? d.fields : null;
    if (!fields) {
      const items = [];
      raw.forEach((x, i) => { if (x.field && isFinite(+x.field.x) && isFinite(+x.field.y)) items.push({ uid: screens[i].uid, x: +x.field.x, y: +x.field.y, rot: 0 }); });
      fields = [{ name: "Общее поле", items }];
    }
    const outFields = [];
    fields.forEach((f, k) => {
      if (!f || typeof f !== "object") return;
      const rects = [];
      for (const it of (Array.isArray(f.items) ? f.items : [])) {
        let s = screens.find((x) => x.uid === String(it.uid || ""));
        if (!s && isFinite(parseInt(it.si, 10))) s = screens[parseInt(it.si, 10)];
        if (!s || rects.some((r) => r.s === s)) continue;
        const [w, h] = rotDims(s.w, s.h, (Math.round((+it.rot || 0) / 45) * 45 % 360 + 360) % 360);
        rects.push({ s, x: Math.round(+it.x || 0), y: Math.round(+it.y || 0), w, h });
      }
      if (!rects.length) return;
      const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
      const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
      outFields.push({
        id: String(f.id || "f" + k), name: String(f.name || (k ? "Общее поле " + (k + 1) : "Общее поле")),
        w: evenUp(x1 - x0), h: evenUp(y1 - y0),
        parts: rects.map((r) => ({ name: r.s.name, x: r.x - x0, y: r.y - y0, w: r.w, h: r.h })), uids: rects.map((r) => r.s.uid),
      });
    });
    const tz = d.tz && typeof d.tz === "object" ? d.tz : {}, tf = tz.fields || {}, tm = tz.masks || {};
    const inField = new Set(outFields.flatMap((f) => f.uids));
    const items = [];
    for (const f of outFields) items.push({ key: "f:" + f.id, type: "field", name: f.name, w: f.w, h: f.h, parts: f.parts, on: tf[f.id] ?? true, note: "общее поле · экраны: " + f.parts.map((p) => p.name).join(", ") });
    for (const s of screens) {
      const it = { key: "m:" + s.uid, type: s.kind, name: s.name, w: s.w, h: s.h, on: tm[s.uid] ?? !inField.has(s.uid) };
      if (s.kind === "proj") { it.proj = s.proj; it.note = "проекция · " + s.proj.nx * s.proj.ny + " × " + s.proj.pw + "×" + s.proj.ph; }
      else if (inField.has(s.uid)) it.note = "стоит на общем поле";
      items.push(it);
    }
    return { name: String(d.projectName || ""), items };
  }

  /* --- нарезка холста на выходы --- */
  // По максимуму: первые куски полного размера выхода, остаток по краю.
  function tileGrid(W, H, cw, ch) {
    const xs = [], ys = [];
    for (let x = 0; x < W; x += cw) xs.push([x, Math.min(cw, W - x)]);
    for (let y = 0; y < H; y += ch) ys.push([y, Math.min(ch, H - y)]);
    const out = [];
    for (const [y, h] of ys) for (const [x, w] of xs) out.push({ x, y, w, h });
    return out;
  }
  // Лучшая ориентация выхода (обычная или повёрнутая на 90°), если поворот разрешён.
  function tileItem(W, H, cw, ch, allowRot) {
    const a = tileGrid(W, H, cw, ch);
    if (!allowRot || cw === ch) return { tiles: a, rot: false };
    const b = tileGrid(W, H, ch, cw);
    return b.length < a.length ? { tiles: b, rot: true } : { tiles: a, rot: false };
  }
  // Упаковка кусков в выходы полками; каждый кусок не больше выхода.
  function packPieces(pieces, cw, ch) {
    const sorted = pieces.map((p, i) => ({ ...p, i })).sort((p, q) => q.h - p.h || q.w - p.w);
    const bins = [];
    for (const p of sorted) {
      let placed = false;
      for (const b of bins) {
        if (b.rot !== p.rot) continue;
        const BW = p.rot ? ch : cw, BH = p.rot ? cw : ch;
        for (const sh of b.shelves) {
          if (p.h <= sh.h && sh.x + p.w <= BW) { b.items.push({ ...p, ox: sh.x, oy: sh.y }); sh.x += p.w; placed = true; break; }
        }
        if (placed) break;
        const top = b.shelves.reduce((m, s) => Math.max(m, s.y + s.h), 0);
        if (top + p.h <= BH && p.w <= BW) { b.shelves.push({ y: top, h: p.h, x: p.w }); b.items.push({ ...p, ox: 0, oy: top }); placed = true; break; }
      }
      if (!placed) bins.push({ rot: p.rot, shelves: [{ y: 0, h: p.h, x: p.w }], items: [{ ...p, ox: 0, oy: 0 }] });
    }
    return bins.map((b) => ({ rot: b.rot, w: b.rot ? ch : cw, h: b.rot ? cw : ch, items: b.items, usedW: Math.max(...b.items.map((i) => i.ox + i.w)), usedH: Math.max(...b.items.map((i) => i.oy + i.h)) }));
  }
  /* Выходы одного уровня (сервер или процессор).
     items: [{key,name,w,h}], fmt: {w,h}, opts: {pack, rot}.
     Проекции на уровне сервера: один выход на проектор. */
  function buildOutputs(items, fmt, opts, level) {
    const pieces = [];
    for (const it of items) {
      if (level === "server" && it.proj) {
        const { pw, ph, nx, ny, ovx = 0, ovy = 0 } = it.proj;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pieces.push({ key: it.key, name: it.name, x: i * (pw - ovx), y: j * (ph - ovy), w: pw, h: ph, rot: false, whole: true, label: "P" + (j * nx + i + 1) });
        continue;
      }
      let { tiles, rot } = tileItem(it.w, it.h, fmt.w, fmt.h, opts.rot);
      // Общее поле: пустые места не выводим — режем кусок по экранам внутри него.
      if (it.parts && it.parts.length) {
        tiles = tiles.map((t) => {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const p of it.parts) {
            const ax = Math.max(t.x, p.x), ay = Math.max(t.y, p.y), bx = Math.min(t.x + t.w, p.x + p.w), by = Math.min(t.y + t.h, p.y + p.h);
            if (bx > ax && by > ay) { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); }
          }
          return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
        }).filter(Boolean);
      }
      tiles.forEach((t) => pieces.push({ key: it.key, name: it.name, ...t, rot, whole: !opts.pack || (t.w === (rot ? fmt.h : fmt.w) && t.h === (rot ? fmt.w : fmt.h)) }));
    }
    const outs = [];
    pieces.filter((p) => p.whole).forEach((p) => outs.push({
      rot: p.rot, w: p.label ? p.w : (p.rot ? fmt.h : fmt.w), h: p.label ? p.h : (p.rot ? fmt.w : fmt.h),
      items: [{ ...p, ox: 0, oy: 0 }], usedW: p.w, usedH: p.h }));
    if (opts.pack) outs.push(...packPieces(pieces.filter((p) => !p.whole), fmt.w, fmt.h));
    // порядок: по экранам, как в списке
    const order = new Map(items.map((it, i) => [it.key, i]));
    outs.sort((a, b) => Math.min(...a.items.map((x) => order.get(x.key))) - Math.min(...b.items.map((x) => order.get(x.key))) || a.items[0].y - b.items[0].y || a.items[0].x - b.items[0].x);
    outs.forEach((o, i) => { o.n = i + 1; o.keys = [...new Set(o.items.map((x) => x.key))]; o.big = Math.max(o.usedW, o.usedH) > 0 && (o.usedW > 2048 || o.usedH > 1200); });
    return outs;
  }

  /* --- распределение по железу --- */
  // Серверы: каждый выход занимает один физический выход сервера с подходящим разрешением.
  function allocServers(outs, servers) {
    const units = [];
    servers.filter((s) => s.on).forEach((s) => { for (let k = 0; k < Math.max(0, s.count | 0); k++) units.push({ dev: s, idx: k + 1, free: Math.max(0, s.outs | 0), used: [] }); });
    const fits = (u, o) => (Math.max(o.usedW, o.usedH) <= Math.max(u.dev.w, u.dev.h) && Math.min(o.usedW, o.usedH) <= Math.min(u.dev.w, u.dev.h));
    // держим выходы одного экрана на одном сервере, если влезают
    const groups = groupByFirstKey(outs);
    for (const g of groups) {
      let u = units.find((u) => u.free >= g.length && g.every((o) => fits(u, o)));
      for (const o of g) {
        const t = u && u.free > 0 && fits(u, o) ? u : units.find((x) => x.free > 0 && fits(x, o));
        if (t) { t.free--; t.used.push(o); o.at = { dev: t.dev.name, unit: t.idx, port: t.used.length }; } else o.at = null;
      }
    }
    return units;
  }
  // Процессоры: ёмкость в слотах; выход 2K стоит 1 слот, 4K — slots/max4K.
  function allocProcessors(outs, procs) {
    const units = [];
    procs.filter((p) => p.on).forEach((p) => { for (let k = 0; k < Math.max(0, p.count | 0); k++) units.push({ dev: p, idx: k + 1, free: Math.max(0, p.max2k | 0), used: [] }); });
    const cost = (u, o) => (o.big ? (u.dev.max4k > 0 ? u.dev.max2k / u.dev.max4k : Infinity) : 1);
    const okRes = (u, o) => Math.max(o.usedW, o.usedH) <= (u.dev.maxW || 8192);
    const groups = groupByFirstKey(outs);
    for (const g of groups) {
      const need = (u) => g.reduce((s, o) => s + cost(u, o), 0);
      let u = units.find((u) => u.free + 1e-9 >= need(u) && g.every((o) => okRes(u, o)));
      for (const o of g) {
        const t = u && u.free + 1e-9 >= cost(u, o) && okRes(u, o) ? u : units.find((x) => x.free + 1e-9 >= cost(x, o) && okRes(x, o));
        if (t) { t.free -= cost(t, o); t.used.push(o); o.at = { dev: t.dev.name, unit: t.idx, port: t.used.length }; } else o.at = null;
      }
    }
    return units;
  }
  function groupByFirstKey(outs) {
    const m = new Map();
    for (const o of outs) { const k = o.keys[0]; if (!m.has(k)) m.set(k, []); m.get(k).push(o); }
    return [...m.values()];
  }

  function calculate(items, set, inv) {
    const active = items.filter((it) => it.on && it.w > 0 && it.h > 0);
    const srvOuts = buildOutputs(active, set.srv, { pack: set.packSrv, rot: set.rotSrv }, "server");
    const viaProc = active.filter((it) => it.viaProc && !it.proj);
    const procOuts = buildOutputs(viaProc, set.proc, { pack: set.packProc, rot: set.rotProc }, "proc");
    const srvUnits = allocServers(srvOuts, inv.servers);
    const procUnits = allocProcessors(procOuts, inv.procs);
    return { active, srvOuts, procOuts, srvUnits, procUnits,
      srvMissing: srvOuts.filter((o) => !o.at).length, procMissing: procOuts.filter((o) => !o.at).length,
      pixels: active.reduce((s, it) => s + it.w * it.h, 0) };
  }

  return { pint, screenDims, parseProjectText, projectItems, tileGrid, tileItem, packPieces, buildOutputs, allocServers, allocProcessors, calculate };
})();
if (typeof module !== "undefined") module.exports = VC;
