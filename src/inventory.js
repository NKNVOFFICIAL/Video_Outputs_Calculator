/* ===== Парк оборудования по умолчанию (редактируется на странице) ===== */
const GPU_OUTS = { A4000: 4, A5000: 4, A6000: 4, "3080": 4, "4090": 4, T1000: 4 };
function resolumeServer(name, gpu1, gpu2, note, on = true) {
  const g = GPU_OUTS[String(gpu1)] || 0;
  // Без второй карты один выход основной карты занят мониторами оператора.
  const outs = gpu1 ? (gpu2 ? g : Math.max(0, g - 1)) : 0;
  return { fam: "resolume", name, gpu1: gpu1 ? String(gpu1) : "", gpu2: gpu2 ? String(gpu2) : "", count: 1, outs, w: 3840, h: 2160, on: on && outs > 0, note: note || "" };
}
const DEFAULT_INV = {
  servers: [
    { fam: "disguise", name: "disguise vx 4", count: 2, outs: 4, w: 3840, h: 2160, on: true, note: "4 выхода 4K на VFC (HDMI 2.0)" },
    { fam: "disguise", name: "disguise vx 2", count: 2, outs: 2, w: 3840, h: 2160, on: true, note: "2 выхода 4K на VFC (HDMI 2.0)" },
    { fam: "disguise", name: "disguise 4x4pro", count: 1, outs: 4, w: 3840, h: 2160, on: true, note: "4 × DP 1.2, 4K только 30 Гц" },
    resolumeServer("Resolume А4000 (0)", "A4000", ""),
    ...Array.from({ length: 10 }, (_, i) => resolumeServer("Resolume 3080 (" + (i + 1) + ")", "3080", "")),
    resolumeServer("Resolume А6000 (11)", "A6000", "T1000"),
    resolumeServer("Resolume А6000 (12)", "A6000", "T1000"),
    resolumeServer("Resolume А6000 (13)", "A6000", "T1000"),
    resolumeServer("Resolume А6000 (14)", "A6000", "T1000"),
    resolumeServer("Resolume А6000 (15)", "", "", "сгорел", false),
    resolumeServer("Resolume А6000 (16)", "A6000", "T1000"),
    resolumeServer("Resolume А5000 (17)", "A5000", ""),
    resolumeServer("Resolume А5000 (18)", "A5000", ""),
    resolumeServer("Resolume А5000 (19)", "A5000", ""),
    resolumeServer("Resolume А5000 (20)", "A5000", "", "в таблице отмечен «сгорел»", false),
    resolumeServer("Resolume 21 навка", "", "", "нет данных о видеокарте", false),
    resolumeServer("Resolume SilverStone 1", "4090", ""),
    resolumeServer("Resolume SilverStone 2", "4090", ""),
    resolumeServer("Resolume SilverStone 3", "A4000", ""),
    resolumeServer("Resolume SilverStone 4", "A4000", ""),
    resolumeServer("Resolume SilverStone 5", "A6000", "A4000", "Quadro Sync II"),
    resolumeServer("Resolume SilverStone 6", "A6000", "A4000", "Quadro Sync II"),
  ],
  procs: [
    { name: "Barco E2 Gen 2", count: 2, max2k: 16, max4k: 8, maxW: 4096, on: true, note: "16 × 2K или 8 × 4K" },
    { name: "Barco E2 Gen 1 (сгорела VPU)", count: 1, max2k: 12, max4k: 3, maxW: 4096, on: true, note: "3 рабочие карты из 4: 12 × 2K или 3 × 4K" },
    { name: "PixelHue Q8", count: 1, max2k: 16, max4k: 16, maxW: 8192, on: true, note: "4 выходные карты × 4 HDMI 2.0, до 16 × 4K" },
    { name: "Magnimage 4000", count: 1, max2k: 4, max4k: 2, maxW: 3840, on: true, note: "4 × Full HD или 2 × 4K, не одновременно" },
  ],
};
