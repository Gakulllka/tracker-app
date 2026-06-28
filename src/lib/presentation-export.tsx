/* ================================================================ *
 *  PRESENTATION EXPORT — React → standalone HTML                   *
 * ================================================================ *
 *
 *  Берёт массив SlideData + тему и делает:
 *    1. Через ReactDOMServer.renderToStaticMarkup рендерит каждый
 *       слайд тем же компонентом, что и в превью (PresentationSlide).
 *    2. Добавляет общий <html>/<head>/<body>, навигацию (стрелки,
 *       точки), keyboard handling.
 *    3. Возвращает строку HTML, которую page.tsx сохраняет в .html
 *       файл через Blob + <a download>.
 *
 *  Гарантия: то, что юзер видит в превью — попадает в HTML 1:1,
 *  потому что используется ОДИН и тот же React-компонент.
 */

import { renderToStaticMarkup } from "react-dom/server";
import {
  PresentationSlide,
  PresentationBgLayer,
  buildTheme,
  type SlideData,
  type AiConclusion,
  type PresentationTheme,
  type TrackerThemeTokens,
} from "./presentation-renderer";
import type { PresBgSettings } from "./store";

/** Главная функция: на вход — данные слайдов и настройки, на выход — готовый HTML.
 *
 *  Phase 6: добавлен tokens — снапшот текущей темы трекера (bgMain, textMain
 *  и т.д.). page.tsx читает их через getComputedStyle перед вызовом этой
 *  функции и передаёт сюда. В SSR-контексте (renderToStaticMarkup) у нас
 *  нет доступа к CSS-переменным, поэтому tokens обязательны. */
export function renderPresentationHtml(
  slides: SlideData[],
  presBg: PresBgSettings,
  aiConclusion: AiConclusion | null | undefined,
  tokens: TrackerThemeTokens,
): string {
  const accentHex = String(slides[0]?.content?.accent || "#5B9BD5");
  const theme = buildTheme(accentHex, presBg, tokens);

  // 1. Слой фона (паттерн + эмодзи) — рендерим один раз, кладём
  //    в body как фиксированный слой. Это идентично тому, что
  //    видит юзер в превью.
  const bgLayerHtml = renderToStaticMarkup(<PresentationBgLayer theme={theme} />);

  // 2. Каждый слайд — отдельный <div class="slide">.
  const slidesHtml = slides
    .map((slide, idx) => {
      const inner = renderToStaticMarkup(
        <PresentationSlide slide={slide} theme={theme} aiConclusion={aiConclusion} fixedAspect />,
      );
      return `<div class="slide${idx === 0 ? " active" : ""}" data-idx="${idx}">${inner}</div>`;
    })
    .join("\n");

  const dotsHtml = slides
    .map((_, i) => `<button class="dot${i === 0 ? " active" : ""}" data-idx="${i}"></button>`)
    .join("");

  return buildShell({
    theme,
    bgLayerHtml,
    slidesHtml,
    dotsHtml,
    slidesCount: slides.length,
  });
}

/* ================================================================ *
 *  Shell: <html><head><body>… с навигацией                         *
 * ================================================================ */

interface ShellArgs {
  theme: PresentationTheme;
  bgLayerHtml: string;
  slidesHtml: string;
  dotsHtml: string;
  slidesCount: number;
}

function buildShell({ theme, bgLayerHtml, slidesHtml, dotsHtml, slidesCount }: ShellArgs): string {
  const [r, g, b] = theme.rgb;
  const acA = `rgba(${r},${g},${b},1)`;

  // Навигационная панель — единственное, что в экспорте отличается
  // от превью (в превью навигация — на родной React-кнопках в page.tsx).
  // Здесь это статический CSS+JS внутри iframe файла.
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Презентация</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',system-ui,sans-serif;
  background:${theme.bodyBg};
  color:${theme.textColor};
  height:100vh;
  overflow:hidden;
}
.bg-layer{position:fixed;inset:0;z-index:0;pointer-events:none}
.deck{width:100%;height:100vh;position:relative;z-index:1}
.slide{
  position:absolute;
  inset:0;
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
  padding:48px 64px 110px;
  opacity:0;
  transform:translateX(60px) scale(.98);
  transition:all .55s cubic-bezier(.4,0,.2,1);
  pointer-events:none;
}
.slide.active{opacity:1;transform:none;pointer-events:all}
.slide.prev{opacity:0;transform:translateX(-60px) scale(.98)}
.nav{
  position:fixed;
  bottom:24px;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  gap:10px;
  align-items:center;
  z-index:100;
  background:rgba(${r},${g},${b},.08);
  border:1px solid rgba(${r},${g},${b},.25);
  backdrop-filter:blur(20px);
  border-radius:40px;
  padding:10px 24px;
}
.nav button.arrow{
  background:none;
  border:none;
  color:rgba(${r},${g},${b},.7);
  cursor:pointer;
  font-size:20px;
  width:36px;
  height:36px;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  transition:.2s;
}
.nav button.arrow:hover{background:rgba(${r},${g},${b},.15);color:${acA}}
.dots{display:flex;gap:6px;align-items:center}
.dot{
  width:8px;
  height:8px;
  border-radius:4px;
  border:none;
  background:rgba(${r},${g},${b},.2);
  cursor:pointer;
  transition:all .3s;
}
.dot.active{width:28px;background:${acA}}
.counter{
  font-size:14px;
  color:rgba(${r},${g},${b},.4);
  min-width:44px;
  text-align:center;
}
@media print{
  @page{size:A4 landscape;margin:0}
  html,body{height:auto;overflow:visible;background:#fff!important}
  .bg-layer{position:absolute}
  .nav{display:none!important}
  .slide{
    position:relative!important;
    inset:auto!important;
    width:100%;
    height:100vh;
    page-break-after:always;
    page-break-inside:avoid;
    opacity:1!important;
    transform:none!important;
    pointer-events:auto!important;
  }
  .slide:last-child{page-break-after:auto}
  /* Печать включает фоны (без этого браузер их выкидывает) */
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
</style>
</head>
<body>
<div class="bg-layer">${bgLayerHtml}</div>
<div class="deck">
${slidesHtml}
</div>
<div class="nav">
  <button class="arrow" id="prevBtn" aria-label="Назад">&#8592;</button>
  <div class="dots" id="dots">${dotsHtml}</div>
  <span class="counter" id="counter">1 / ${slidesCount}</span>
  <button class="arrow" id="nextBtn" aria-label="Далее">&#8594;</button>
</div>
<script>
(function(){
  var slides=document.querySelectorAll('.slide');
  var dots=document.querySelectorAll('.dot');
  var counter=document.getElementById('counter');
  var cur=0;
  function goTo(n){
    if(n<0||n>=slides.length)return;
    slides[cur].classList.remove('active');
    slides[cur].classList.add('prev');
    var prevIdx=cur;
    setTimeout(function(){slides[prevIdx].classList.remove('prev');},500);
    cur=n;
    slides[cur].classList.add('active');
    dots.forEach(function(d,i){d.classList.toggle('active',i===cur);});
    counter.textContent=(cur+1)+' / '+slides.length;
  }
  document.getElementById('prevBtn').onclick=function(){goTo(cur-1);};
  document.getElementById('nextBtn').onclick=function(){goTo(cur+1);};
  dots.forEach(function(d){d.onclick=function(){goTo(Number(d.dataset.idx));};});
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' ')goTo(cur+1);
    if(e.key==='ArrowLeft')goTo(cur-1);
  });
})();
</script>
</body>
</html>`;
}
