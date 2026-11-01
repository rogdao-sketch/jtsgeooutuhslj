# redis — контекст для новой сессии

## Задача
Сделать сайт-визитку студии в стиле сайта https://www.igloo.inc (холодная серо-голубая палитра,
ASCII-прелоадер вида `=--==++==-`, 3D-пространство, шейдерный фон/жидкость, плавный скролл, минимум текста).
Контент берём из «Мира сайтов», дизайн — новый, в духе Igloo. Копировать сайт Igloo (код, бренд, тексты) нельзя —
берём только стиль и технику.

Желание пользователя: сайт должен быть МАКСИМАЛЬНО ПОХОЖ на igloo.inc по структуре, подаче и ощущению
(загрузка → вход в 3D-пространство → скролл как путешествие по сцене → редкие короткие подписи), но целиком
про НАШУ деятельность (веб-студия: сайты, 3D/WebGL, магазины, Telegram Mini Apps). Свои образы вместо пингвинов
и ледяного мира; свои тексты, свои 3D-объекты (делать в Blender → .glb), свой логотип/цвета.
Перед разработкой: открыть igloo.inc в Edge через playwright-core (в панели Claude на этом сайте виден только
прелоадер), прокрутить, заснять скриншоты и разобрать: палитру, типографику, прелоадер, переходы, как работает скролл-камера.
По данным Awwwards его стек: Three.js, three-mesh-bvh, Svelte, GSAP, Vite, симуляция жидкости на шейдерах.

## Источник контента (ТОЛЬКО ЧТЕНИЕ, не менять!)
`C:\Users\Rogday\Desktop\ㅤ\mir-saitov`
- `src/data.ts` — работы (Apple Favorite, Гербарий №7, ПОЛЕ, Maison Pétale, ЗЕРНО, Bubble Tea Love), услуги, контакты
- `public/works/` — видео и постеры работ, `public/team/`, `public/earth/`, `public/floors/`
- `models-src/` — 3D-модели (CC BY, со Sketchfab; помнить про указание авторства)
- `src/components/` — старые разделы (Hero, Works, Skills, Team, Process, Security, RunnerGame, Console, Contact и др.)
- README.md — описание разделов. Контакты в `CONTACTS` пустые — спросить у пользователя.
Не открывать `.env` и любые файлы с секретами в других папках.

## Стек (уже установлен в этой папке, сборка проверена)
Vite 8, React 19, TypeScript, Tailwind 4, three, @react-three/fiber, @react-three/drei, postprocessing,
gsap, lenis, motion, vite-plugin-glsl (шейдеры .glsl), playwright-core (использовать системный Edge:
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, Chromium не скачивали).
Команды: `npm run dev`, `npm run build`.

## Подключения (.mcp.json в этой папке)
- `blender` — mcp-for-blender через uvx (`C:/Users/Rogday/AppData/Local/Microsoft/WinGet/Links/uvx.exe`), телеметрия выключена.
  Аддон установлен в Blender 5.2, нужно нажать N → вкладка «MCP for Blender» → Start MCP Server (порт 9876).
- `aftereffects` — @kumoproductions/mcp-aftereffects. В AE включено «Разрешить сценариям запись файлов и доступ к сети».
  Для сайта AE не нужен, только если понадобится видео. Режим произвольного ExtendScript (`AE_MCP_ENABLE_EVAL`) НЕ включать.
- Blender: перед работой просить сохранить .blend, работать с копиями; `execute_blender_code` запускает любой Python.

## Правила пользователя
- Оригинальные проекты на Рабочем столе не менять; работаем только в `redis`.
- Всё, что хочешь установить: сначала список «что и зачем», потом жду «ок», потом ставлю.
- Общение по-русски.
- Ещё не установлены (ждут ревью кода и «ок»): skills freshtechbro/claudedesignskills (threejs-webgl, gsap-scrolltrigger)
  и tponscr-debug/claude-skill-awwwards.

## Ассеты сайта
- Маяк: `assets-src/lighthouse_v2.blend` → `public/models/lighthouse.glb` (Draco, декодер в `public/draco`). AO запечён в цвета вершин.
- Текстуры и HDRI: Poly Haven, CC0 (указывать авторство не нужно): `public/textures/` (rock_face_03, rock_boulder_dry, 1k),
  `public/env/overcast_soil_puresky_1k.hdr`. UV у моделей нет — текстуры кладутся трипланарно (`src/lib/triplanar.ts`).
- Шрифт: `@fontsource/ibm-plex-mono` (400, 500).

## Сцена (v2, по структуре igloo.inc)
- Наверху: маяк на снежном нагорье (`Terrain.tsx`, горы из шума, сетка под курсором). Наведение на маяк: кирпичи
  разъезжаются, светятся щели, сетка с числами 1–100 (`Lighthouse.tsx`, `HoverNet.tsx`). Наведение — свой луч каждый кадр
  (`lib/hover.ts`), события R3F на мешах тут не срабатывали.
- Ниже, через затемнение: кристалл (3D/WebGL), кольцо-витрина (магазины), телефон с самолётиком (Telegram), площадка с работами.
  Высоты сцен — `SECTION_Y` в `lib/journey.ts`. Частицы — «пиксельный снег» по ветру (`Atmosphere.tsx`).
- Звук без файлов, Web Audio (`lib/sound.ts`): ветер с порывами, низкий гул, пинги на сетке, взмах при смене главы.
  По умолчанию выключен (кнопка «Звук» справа внизу). Переходы: FOV, крен, сгущение тумана, размытие, поток частиц.
- Качество: `lib/quality.ts` (телефоны и слабые машины: без DOF и аберрации, меньше dpr, частиц и сетки рельефа);
  PerformanceMonitor сам снижает dpr при падении FPS. Сцена грузится отдельным чанком (`lazy`), в первом чанке нет three.js.
- Защита от чёрных вспышек: проход Sanitize в `Effects.tsx` (NaN/Inf до bloom).

## План
1. Проверить связь с Blender и AE (если нужен).
2. Скопировать данные (data.ts, картинки/видео работ) в `redis`.
3. Дизайн-система Igloo: палитра, шрифт, ASCII-прелоадер, шейдерный фон (жидкость/частицы), Lenis + GSAP.
4. Разделы: герой, работы, возможности, команда, процесс, контакты.
5. Проверка в Edge через playwright-core (десктоп и мобильная версия), производительность.
