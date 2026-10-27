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
  /* Имя PNG из ZIP ТЗ: «ШxВ-название» (маска) или «ШxВ-scr1-2-5» (общее поле). */
  function tzPngInfo(path) {
    const file = path.split("/").pop().replace(/\.png$/i, "");
    const m = file.match(/^(\d+)x(\d+)-(.*)$/);
    if (!m) return null;
    const f = m[3].match(/^scr(\d+(?:-\d+)*)$/);
    return f ? { w: +m[1], h: +m[2], field: true, name: "Общее поле (экраны " + f[1].split("-").join(", ") + ")" }
      : { w: +m[1], h: +m[2], field: false, name: m[3] || "screen" };
  }
  /* Папка ZIP ТЗ: «Проект ТЗ_Resolume/» → {project, label} */
  function tzFolderInfo(path) {
    const m = path.split("/")[0].match(/^(.*) ТЗ_(\w+)$/);
    return m ? { project: m[1], label: m[2] } : null;
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
  /* Упаковка кусков в выходы методом MaxRects (лучшая короткая сторона).
     Куски не поворачиваются; у повёрнутых выходов свои рамки. */
  function packPieces(pieces, cw, ch) {
    const sorted = pieces.map((p, i) => ({ ...p, i })).sort((p, q) => Math.max(q.w, q.h) - Math.max(p.w, p.h) || q.w * q.h - p.w * p.h);
    const bins = [];
    const place = (bin, p, r) => {
      bin.items.push({ ...p, ox: r.x, oy: r.y });
      const used = { x: r.x, y: r.y, w: p.w, h: p.h }, next = [];
      for (const f of bin.free) {
        if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) { next.push(f); continue; }
        if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
        if (used.x + used.w < f.x + f.w) next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
        if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
        if (used.y + used.h < f.y + f.h) next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
      }
      bin.free = next.filter((f, i) => !next.some((g, j) => j !== i && g.x <= f.x && g.y <= f.y && g.x + g.w >= f.x + f.w && g.y + g.h >= f.y + f.h && (j < i || g.w * g.h > f.w * f.h)));
    };
    for (const p of sorted) {
      let best = null;
      for (const bin of bins) {
        if (bin.rot !== p.rot) continue;
        for (const f of bin.free) {
          if (p.w > f.w || p.h > f.h) continue;
          const score = Math.min(f.w - p.w, f.h - p.h), score2 = Math.max(f.w - p.w, f.h - p.h);
          if (!best || score < best.score || (score === best.score && score2 < best.score2)) best = { bin, r: f, score, score2 };
        }
        if (best) break; // заполняем выходы по порядку
      }
      if (!best) {
        const W = p.rot ? ch : cw, H = p.rot ? cw : ch, bin = { rot: p.rot, W, H, free: [{ x: 0, y: 0, w: W, h: H }], items: [] };
        bins.push(bin);
        best = { bin, r: bin.free[0] };
      }
      place(best.bin, p, best.r);
    }
    return bins.map((b) => ({ rot: b.rot, w: b.W, h: b.H, items: b.items, usedW: Math.max(...b.items.map((i) => i.ox + i.w)), usedH: Math.max(...b.items.map((i) => i.oy + i.h)) }));
  }
  /* Границы занятых пикселей внутри куска. occ: {w, h, data: Uint8Array w*h (1 — занято), rows: Uint8Array h} */
  function occBBox(occ, t) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const xe = Math.min(occ.w, t.x + t.w), ye = Math.min(occ.h, t.y + t.h);
    for (let y = t.y; y < ye; y++) {
      if (!occ.rows[y]) continue;
      const row = y * occ.w;
      let a = t.x; while (a < xe && !occ.data[row + a]) a++;
      if (a >= xe) continue;
      let b = xe - 1; while (b > a && !occ.data[row + b]) b--;
      if (a < x0) x0 = a; if (b > x1) x1 = b; if (y < y0) y0 = y; y1 = y;
    }
    return x1 >= 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
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
      } else if (it.occ) {
        // Поле из PNG ТЗ: режем кусок по непустым (не чёрным) пикселям картинки.
        tiles = tiles.map((t) => occBBox(it.occ, t)).filter(Boolean);
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
  const makeUnits = (servers) => {
    const units = [];
    servers.filter((s) => s.on).forEach((s) => { for (let k = 0; k < Math.max(0, s.count | 0); k++) units.push({ dev: s, idx: k + 1, free: Math.max(0, s.outs | 0), used: [] }); });
    return units;
  };
  function allocServers(outs, servers, given) {
    const units = given || makeUnits(servers);
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
  /* Связки: серверы с непустой связкой (cluster) работают только со своей связкой.
     disguise 4x4pro не работает вместе с vx — это разные связки. Серверы без связки
     (Resolume) независимы и добавляются к любой. Выбираем связку, при которой
     не хватает меньше всего выходов, при равенстве — где занято меньше серверов. */
  /* Связки и резерв.
     Серверы с непустой связкой (cluster) работают только со своей связкой: disguise 4x4pro
     не встаёт к vx. Серверы без связки (Resolume) независимы и добавляются к любой.
     backup — сколько бэкап-серверов на каждый мейн: бэкап той же связки, не меньше выходов,
     то же или большее разрешение выхода. Выбираем связку, где не хватает меньше всего. */
  function pickServers(outs, servers, choice, backup = 0) {
    const live = servers.filter((s) => s.on && (s.count | 0) > 0 && (s.outs | 0) > 0);
    const clusters = [...new Set(live.map((s) => s.cluster || "").filter(Boolean))];
    const cands = choice !== "auto" && clusters.includes(choice) ? [choice] : clusters.length ? clusters : [""];
    const run = (c) => {
      const pool = live.filter((s) => !s.cluster || s.cluster === c);
      outs.forEach((o) => { o.at = null; o.backups = []; });
      const all = makeUnits(pool);
      const mainSet = backup > 0 ? chooseMains(all, outs.length, backup) : all;
      const units = allocServers(outs, null, mainSet);
      if (mainSet !== all) all.forEach((u) => { if (!mainSet.includes(u)) units.push(u); });
      let bMiss = 0;
      if (backup > 0) {
        const mains = units.filter((u) => u.used.length).sort((p, q) => q.used.length - p.used.length);
        for (const m of mains) {
          m.role = "main";
          m.backups = [];
          for (let k = 0; k < backup; k++) {
            const need = m.used.length, maxW = Math.max(...m.used.map((o) => Math.max(o.usedW, o.usedH))), minS = Math.max(...m.used.map((o) => Math.min(o.usedW, o.usedH)));
            const cand = units.filter((u) => !u.used.length && !u.role && (u.dev.outs | 0) >= need && Math.max(u.dev.w, u.dev.h) >= maxW && Math.min(u.dev.w, u.dev.h) >= minS
              && (!m.dev.cluster ? u.dev === m.dev || u.dev.fam === m.dev.fam : u.dev.cluster === m.dev.cluster))
              .sort((p, q) => (p.dev === m.dev ? 0 : 1) - (q.dev === m.dev ? 0 : 1) || (p.dev.outs - q.dev.outs));
            const u = cand[0];
            if (!u) { bMiss++; continue; }
            u.role = "backup"; u.mainOf = m; m.backups.push(u);
            m.used.forEach((o, i) => o.backups.push({ dev: u.dev.name, unit: u.idx, port: i + 1 }));
          }
        }
      }
      const miss = outs.filter((o) => !o.at).length, used = units.filter((u) => u.used.length || u.role === "backup").length;
      return { c, units, miss, bMiss, used };
    };
    let best = null;
    for (const c of cands) {
      const r = run(c);
      const key = (x) => [x.miss + x.bMiss, x.miss, x.used];
      if (!best || cmp(key(r), key(best)) < 0) best = r;
    }
    const fin = run(best.c);
    return { units: fin.units, cluster: fin.c, clusters, backupMissing: fin.bMiss };
  }
  /* Подбор мейн-серверов под резерв: перебираем, сколько серверов каждого вида взять в мейн,
     и берём вариант, где у каждого мейна находятся бэкапы, а серверов занято меньше. */
  function chooseMains(units, N, backup) {
    const kind = (u) => [u.dev.fam, u.dev.cluster || "", u.dev.outs, u.dev.w, u.dev.h].join("|");
    const types = [...units.reduce((m, u) => m.set(kind(u), [...(m.get(kind(u)) || []), u]), new Map()).values()]
      .sort((a, b) => b[0].dev.outs - a[0].dev.outs);
    let combos = 1;
    for (const t of types) combos *= t.length + 1;
    if (combos > 50000) return units;
    let best = null;
    const vec = new Array(types.length).fill(0);
    const evalVec = () => {
      const mains = types.flatMap((t, i) => t.slice(0, vec[i]));
      const cap = mains.reduce((s, u) => s + u.dev.outs, 0);
      if (cap < N && mains.length < units.length) { if (cap === 0) return; }
      let left = N;
      const loads = mains.map((u) => { const l = Math.min(u.dev.outs, left); left -= l; return l; });
      if (loads.some((l) => l === 0)) return; // лишний мейн
      const spare = types.flatMap((t, i) => t.slice(vec[i])).sort((a, b) => a.dev.outs - b.dev.outs);
      let bMiss = 0;
      mains.map((u, i) => ({ u, l: loads[i] })).sort((a, b) => b.l - a.l).forEach(({ u, l }) => {
        for (let k = 0; k < backup; k++) {
          const j = spare.findIndex((x) => x.dev.outs >= l && x.dev.fam === u.dev.fam && (x.dev.cluster || "") === (u.dev.cluster || ""));
          if (j < 0) bMiss++; else spare.splice(j, 1);
        }
      });
      const key = [Math.max(0, N - cap), bMiss, mains.length * (1 + backup), mains.length];
      if (!best || cmp(key, best.key) < 0) best = { key, mains };
    };
    const rec = (i) => { if (i === types.length) return evalVec(); for (let k = 0; k <= types[i].length; k++) { vec[i] = k; rec(i + 1); } vec[i] = 0; };
    rec(0);
    return best ? best.mains : units;
  }
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
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
    const pick = pickServers(srvOuts, inv.servers, set.cluster || "auto", set.backup | 0);
    const srvUnits = pick.units;
    const procUnits = allocProcessors(procOuts, inv.procs);
    return { active, srvOuts, procOuts, srvUnits, procUnits, cluster: pick.cluster, clusters: pick.clusters, backup: set.backup | 0, backupMissing: pick.backupMissing,
      srvMissing: srvOuts.filter((o) => !o.at).length, procMissing: procOuts.filter((o) => !o.at).length,
      pixels: active.reduce((s, it) => s + it.w * it.h, 0) };
  }

  return { pint, screenDims, tzPngInfo, tzFolderInfo, occBBox, parseProjectText, projectItems, tileGrid, tileItem, packPieces, buildOutputs, allocServers, pickServers, allocProcessors, calculate };
})();
if (typeof module !== "undefined") module.exports = VC;
