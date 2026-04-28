import { MONTHS } from "./types";

export interface SlideData {
  type: "title" | "kpi" | "statuses" | "completed" | "inprogress" | "table" | "summary";
  content: Record<string, unknown>;
}

export function buildSlidesHTML(
  slides: SlideData[],
  _month: number = 0,
  accentHex: string = "#5B9BD5"
): string {
  const accent = accentHex || "#5B9BD5";

  function escHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSlide(slide: SlideData, idx: number): string {
    const c = slide.content;
    switch (slide.type) {
      case "title": {
        const month = String(c.month || "");
        const total = Number(c.total || 0);
        const completed = Number(c.completed || 0);
        const pct = Number(c.pct || 0);
        return `
          <div class="slide${idx === 0 ? " active" : ""}" data-idx="${idx}">
            <div class="slide-title">
              <div class="title-badge">${escHtml(month)}</div>
              <h1>Отчёт по задачам</h1>
              <div class="title-stats">
                <div class="kpi-card"><span class="kpi-val">${total}</span><span class="kpi-lbl">Всего задач</span></div>
                <div class="kpi-card"><span class="kpi-val">${completed}</span><span class="kpi-lbl">Выполнено</span></div>
                <div class="kpi-card"><span class="kpi-val">${pct}%</span><span class="kpi-lbl">Прогресс</span></div>
              </div>
              <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${Math.min(pct, 100)}%;background:${accent}"></div></div>
            </div>
          </div>`;
      }
      case "kpi": {
        const total = Number(c.total || 0);
        const completed = Number(c.completed || 0);
        const planH = String(c.planH || "0");
        const factH = String(c.factH || "0");
        return `
          <div class="slide" data-idx="${idx}">
            <h2>Ключевые показатели</h2>
            <div class="kpi-grid">
              <div class="kpi-card"><span class="kpi-val">${total}</span><span class="kpi-lbl">Всего задач</span></div>
              <div class="kpi-card"><span class="kpi-val">${completed}</span><span class="kpi-lbl">Выполнено</span></div>
              <div class="kpi-card"><span class="kpi-val">${planH} ч</span><span class="kpi-lbl">План часов</span></div>
              <div class="kpi-card"><span class="kpi-val">${factH} ч</span><span class="kpi-lbl">Факт часов</span></div>
            </div>
          </div>`;
      }
      case "statuses": {
        const statusCounts = (c.statusCounts || {}) as Record<string, number>;
        const maxVal = Math.max(...Object.values(statusCounts), 1);
        const bars = Object.entries(statusCounts)
          .map(([status, count]) => {
            const pct = Math.round((count / maxVal) * 100);
            return `<div class="status-row"><span class="status-lbl">${escHtml(status)}</span><div class="status-bar-bg"><div class="status-bar-fill" style="width:${pct}%;background:${accent}"></div></div><span class="status-cnt">${count}</span></div>`;
          })
          .join("");
        return `
          <div class="slide" data-idx="${idx}">
            <h2>Распределение по статусам</h2>
            <div class="status-list">${bars || "<p>Нет данных</p>"}</div>
          </div>`;
      }
      case "completed":
      case "inprogress": {
        const tasks = (c.tasks || []) as Array<{ num: string; name: string; priority: string; status: string }>;
        const total = Number(c.total || 0);
        const title = slide.type === "completed" ? "Выполненные задачи" : "Задачи в работе";
        const rows = tasks
          .map(
            (t) =>
              `<tr><td>${escHtml(t.num || "—")}</td><td>${escHtml(t.name || "—")}</td><td>${escHtml(t.priority || "—")}</td></tr>`
          )
          .join("");
        return `
          <div class="slide" data-idx="${idx}">
            <h2>${title} ${total > tasks.length ? `(показано ${tasks.length} из ${total})` : `(${total})`}</h2>
            <div class="slide-table-wrap"><table class="slide-table"><thead><tr><th>№</th><th>Наименование</th><th>Приоритет</th></tr></thead><tbody>${rows}</tbody></table></div>
          </div>`;
      }
      case "table": {
        const tasks = (c.rows || []) as Array<{ num: string; name: string; planH: string; factH: string; status: string; priority: string }>;
        const total = Number(c.total || 0);
        const rows = tasks
          .map(
            (t) =>
              `<tr><td>${escHtml(t.num || "—")}</td><td>${escHtml(t.name || "—")}</td><td>${escHtml(t.planH || "0")}</td><td>${escHtml(t.factH || "0")}</td><td>${escHtml(t.priority || "—")}</td><td>${escHtml(t.status || "—")}</td></tr>`
          )
          .join("");
        return `
          <div class="slide" data-idx="${idx}">
            <h2>Полная таблица задач ${total > tasks.length ? `(показано ${tasks.length} из ${total})` : `(${total})`}</h2>
            <div class="slide-table-wrap"><table class="slide-table"><thead><tr><th>№</th><th>Наименование</th><th>План</th><th>Факт</th><th>Приоритет</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table></div>
          </div>`;
      }
      case "summary": {
        const month = String(c.month || "");
        return `
          <div class="slide" data-idx="${idx}">
            <div class="slide-summary">
              <h2>Спасибо за внимание!</h2>
              <p class="summary-month">${escHtml(month)}</p>
              <div class="summary-accent-bar" style="background:${accent}"></div>
            </div>
          </div>`;
      }
      default:
        return `<div class="slide" data-idx="${idx}"><p>Неизвестный тип слайда</p></div>`;
    }
  }

  const slidesHtml = slides.map(renderSlide).join("\n");
  const dotsHtml = slides
    .map((_, i) => `<button class="dot${i === 0 ? " active" : ""}" data-idx="${i}"></button>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Презентация — Отчёт по задачам</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f0f0; color: #1a1a1a; overflow: hidden; height: 100vh; }
.slide { display:none; position:absolute; inset:0; padding:60px 80px; background:white; justify-content:center; align-items:center; flex-direction:column; }
.slide.active { display:flex; }
.slide h1 { font-size:2.8rem; font-weight:700; margin-bottom:24px; color:#1a1a1a; }
.slide h2 { font-size:2rem; font-weight:700; margin-bottom:32px; color:#1a1a1a; }
.title-badge { display:inline-block; padding:8px 24px; border-radius:99px; background:${accent}; color:white; font-size:1.1rem; font-weight:600; margin-bottom:16px; }
.title-stats { display:flex; gap:32px; margin-bottom:24px; }
.kpi-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:24px; max-width:800px; width:100%; }
.kpi-card { display:flex; flex-direction:column; align-items:center; padding:24px 32px; background:#f7f7f7; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
.kpi-val { font-size:2.4rem; font-weight:700; color:${accent}; }
.kpi-lbl { font-size:0.9rem; color:#666; margin-top:4px; }
.progress-bar-wrap { width:100%; max-width:400px; height:12px; background:#e5e5e5; border-radius:6px; overflow:hidden; }
.progress-bar-fill { height:100%; border-radius:6px; transition:width 0.6s ease; }
.status-list { width:100%; max-width:600px; }
.status-row { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.status-lbl { min-width:180px; font-size:0.9rem; text-align:right; color:#444; }
.status-bar-bg { flex:1; height:24px; background:#e5e5e5; border-radius:4px; overflow:hidden; }
.status-bar-fill { height:100%; border-radius:4px; transition:width 0.4s ease; }
.status-cnt { min-width:40px; font-size:0.9rem; font-weight:600; text-align:center; }
.slide-table-wrap { width:100%; overflow:auto; max-height:60vh; }
.slide-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
.slide-table th { background:${accent}; color:white; padding:10px 14px; text-align:left; position:sticky; top:0; }
.slide-table td { padding:8px 14px; border-bottom:1px solid #eee; }
.slide-table tr:hover td { background:#f7f7f7; }
.slide-summary { text-align:center; }
.summary-month { font-size:1.3rem; color:#888; margin-bottom:24px; }
.summary-accent-bar { width:120px; height:6px; border-radius:3px; margin:0 auto; }
.nav { position:fixed; bottom:32px; left:50%; transform:translateX(-50%); display:flex; gap:10px; align-items:center; z-index:10; background:white; padding:12px 24px; border-radius:99px; box-shadow:0 2px 12px rgba(0,0,0,0.12); }
.nav button { width:40px; height:40px; border-radius:50%; border:none; background:${accent}; color:white; font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.nav button:hover { opacity:0.85; }
.dot { width:12px; height:12px; border-radius:50%; border:none; background:#ddd; cursor:pointer; transition:background 0.2s; }
.dot.active { background:${accent}; transform:scale(1.3); }
.slide-counter { font-size:0.85rem; color:#888; margin:0 8px; }
</style>
</head>
<body>
${slidesHtml}
<div class="nav">
  <button id="prevBtn">&#9664;</button>
  <span class="slide-counter" id="counter">1 / ${slides.length}</span>
  ${dotsHtml}
  <button id="nextBtn">&#9654;</button>
</div>
<script>
let current = 0;
const total = ${slides.length};
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const counter = document.getElementById('counter');
function goTo(idx) {
  if (idx < 0 || idx >= total) return;
  slides[current].classList.remove('active');
  dots[current].classList.remove('active');
  current = idx;
  slides[current].classList.add('active');
  dots[current].classList.add('active');
  counter.textContent = (current + 1) + ' / ' + total;
}
document.getElementById('prevBtn').onclick = () => goTo(current - 1);
document.getElementById('nextBtn').onclick = () => goTo(current + 1);
dots.forEach(d => d.onclick = () => goTo(Number(d.dataset.idx)));
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') goTo(current + 1);
  if (e.key === 'ArrowLeft') goTo(current - 1);
});
goTo(0);
</script>
</body>
</html>`;
}
