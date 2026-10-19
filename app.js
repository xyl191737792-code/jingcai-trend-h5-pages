(() => {
  const root = document.getElementById("jczq-trend-v2");
  if (!root) return;
  const core = window.JingcaiTrendCore;
  const logos = window.teamLogos || {};
  const chart = root.querySelector(".trend-chart");
  const chartWrap = root.querySelector(".chart-wrap");
  const chartAxis = root.querySelector(".chart-axis");
  const matchList = root.querySelector(".match-list");
  const grid = root.querySelector(".chart-grid");
  const labels = root.querySelector(".chart-labels");
  const lines = root.querySelector(".chart-lines");
  const pointsLayer = root.querySelector(".chart-points");
  const tabs = [...root.querySelectorAll(".mode-tab")];
  const dateSelect = root.querySelector("#date-select");
  const status = root.querySelector("#page-status");
  const shareButton = root.querySelector("#share-button");
  const ns = "http://www.w3.org/2000/svg";
  const state = { archive: null, days: [], visibleDays: [], matches: [], date: "", mode: "normal" };
  let refreshingArchive = false;
  const modes = {
    normal: { title: "胜平负", categories: core.allowed.normal, color: "#5dd4e4", summaryName: "胜平负", fact: match => core.modeValue(match, "normal") },
    handicap: { title: "让球胜平负", categories: core.allowed.handicap, color: "#f0b766", summaryName: "让球胜平负", fact: match => core.modeValue(match, "handicap") },
    goals: { title: "进球数", categories: core.allowed.goals, color: "#91b9fa", summaryName: "进球数", fact: match => core.modeValue(match, "goals") },
    halfFull: { title: "半全场", categories: core.allowed.halfFull, color: "#c6a4e9", summaryName: "半全场", fact: match => core.modeValue(match, "halfFull") }
  };

  function make(tag, attrs = {}, content) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function makeSvg(tag, attrs = {}, content) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function initials(name) { return String(name || "队伍").replace(/U23/gi, "").slice(0, 2) || "队"; }
  function logo(name, source) {
    const image = make("img", { class: "team-logo", src: source || logos[name] || "", alt: `${name || "球队"}队徽`, decoding: "async", referrerpolicy: "no-referrer" });
    image.addEventListener("error", () => image.replaceWith(make("span", { class: "team-logo is-fallback", "aria-label": `${name || "球队"}队徽` }, initials(name))), { once: true });
    return image;
  }
  function resultLabel(value) { return value || "待赛"; }
  function isCompleted(match) { return core.hasResult(match); }
  function setStatus(message, kind = "info", action) {
    status.replaceChildren();
    status.dataset.kind = kind;
    status.append(document.createTextNode(message));
    if (action) status.append(action);
    status.hidden = !message;
  }
  function updateSummary() {
    const mode = modes[state.mode];
    const values = state.matches.map(mode.fact).filter(Boolean);
    const counts = mode.categories.map(category => [category, values.filter(value => value === category).length]);
    const most = [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];
    root.querySelector("#summaryMode").replaceChildren(
      make("span", { class: "summary-label" }, "最高频"),
      make("strong", { class: state.mode === "handicap" ? "orange" : "blue" }, most ? `${most[0]}${state.mode === "goals" ? "球" : ""} · ${most[1]}场` : "暂无完赛结果")
    );
    root.querySelector("#summarySecondary").replaceChildren(
      make("span", { class: "summary-label" }, "结算率"),
      make("strong", {}, state.matches.length ? `${values.length}/${state.matches.length}` : "—")
    );
  }
  function updateActiveResults() {
    const mode = modes[state.mode];
    matchList.querySelectorAll(".match-item").forEach((item, index) => {
      const match = state.matches[index];
      const value = mode.fact(match);
      item.querySelectorAll(".fact").forEach(fact => fact.classList.toggle("is-active", fact.dataset.kind === state.mode));
      item.querySelector(".active-result").textContent = value ? `${mode.title} · ${value}` : `${mode.title} · 待赛/无结果`;
      item.setAttribute("aria-label", `${match.code} ${match.league}，${match.home} ${match.score || "未赛"} ${match.away}，${mode.title}${value || "暂无结果"}`);
    });
  }
  function renderMatch(match, index) {
    const done = isCompleted(match);
    const parsedHalf = core.parseScore(match.half);
    const halfText = parsedHalf ? `半场 ${match.half}` : "半场 —";
    const time = core.kickoffDisplay(match.kickoff, match.kickoffDate || match.date || state.date);
    const dateText = time.date ? core.dateLabel(time.date) : "";
    const article = make("article", {
      class: `match-item${done ? "" : " is-pending"}`,
      role: "listitem",
      "data-index": String(index),
      "aria-label": `${match.code} ${match.league}，${match.home} ${match.score || "未赛"} ${match.away}`
    });
    const meta = make("div", { class: "match-meta" });
    meta.append(make("span", { class: "code" }, match.code), make("span", { class: "league-tag" }, match.league || "—"));
    if (time.time) meta.append(make("span", { class: "match-time" }, `${dateText ? `${dateText} ` : ""}${time.time}`));
    if (!done && /取消|腰斩|延期|中止/.test(String(match.status || match.state || ""))) meta.append(make("span", { class: "match-state" }, String(match.status || match.state)));

    const fixture = make("div", { class: "fixture" });
    const home = make("div", { class: "team-side home" });
    home.append(logo(match.home, match.homeLogo), make("span", { class: "team-name" }, match.home || "主队"));
    const away = make("div", { class: "team-side away" });
    away.append(logo(match.away, match.awayLogo), make("span", { class: "team-name" }, match.away || "客队"));
    const score = make("div", { class: "score" });
    score.append(make("strong", {}, done ? match.score : "—"), make("span", {}, halfText));
    fixture.append(home, score, away);

    const facts = make("div", { class: "facts" });
    const normal = core.modeValue(match, "normal");
    const handicap = core.modeValue(match, "handicap");
    const goals = core.modeValue(match, "goals");
    const halfFull = core.modeValue(match, "halfFull");
    const factData = [
      ["胜平负", resultLabel(normal), "normal"],
      [`让球${match.line ?? "—"}`, resultLabel(handicap?.replace("让", "")), "handicap"],
      ["进球数", goals ? `${goals}球` : "待赛", "goals"],
      ["半全场", halfFull || "待赛", "halfFull"]
    ];
    factData.forEach(([label, value, kind]) => {
      const fact = make("div", { class: "fact " + (kind === "halfFull" ? "half-full" : kind), "data-kind": kind });
      fact.append(make("span", { class: "fact-label" }, label), make("strong", { class: "fact-value" }, value));
      facts.append(fact);
    });
    article.append(meta, fixture, facts, make("span", { class: "active-result", "aria-live": "polite" }, ""));
    return article;
  }
  function updateHeader() {
    const matches = state.matches;
    const total = matches.length;
    const completed = matches.filter(isCompleted).length;
    const codes = matches.map(match => match.code).filter(Boolean);
    const start = codes[0] || "暂无编号";
    const end = codes[codes.length - 1] || "—";
    root.querySelector(".eyebrow").textContent = core.dateLabel(state.date);
    root.querySelector(".headline-total").setAttribute("aria-label", `${total}场比赛，${completed}场完赛`);
    root.querySelector(".headline-total strong").textContent = String(total);
    root.querySelector(".headline-total span").textContent = total > 0 && completed === total ? "全部完赛" : `${completed}/${total}完赛`;
    root.querySelector("#report-title").textContent = total === completed ? `完赛战报 · ${total}场` : `比赛战报 · ${total}场`;
    root.querySelector("#chart-range").replaceChildren(make("strong", {}, start), document.createTextNode(" ↓ "), make("strong", {}, end));
    root.querySelector("#chart-desc").textContent = `${core.dateLabel(state.date)}，${total}场比赛从${start}到${end}按竞彩编号从上到下排列，展示${modes[state.mode].title}；无赛果场次不参与连线。`;
    document.title = `${core.dateLabel(state.date)} · ${modes[state.mode].title}走势`;
  }
  function renderChart() {
    const mode = modes[state.mode];
    const width = chartWrap.getBoundingClientRect().width;
    if (!width) return;
    const compactLabels = mode.categories.length > 5;
    const left = compactLabels ? 78 : 86;
    const right = compactLabels ? 18 : 24;
    const top = 25;
    const bottom = 25;
    const rowGap = 40;
    const height = Math.max(top + Math.max(state.matches.length - 1, 0) * rowGap + bottom, 72);
    const plotWidth = Math.max(width - left - right, 1);
    const x = index => left + index * (plotWidth / Math.max(mode.categories.length - 1, 1));
    const y = index => top + index * rowGap;
    const columnGap = plotWidth / Math.max(mode.categories.length - 1, 1);
    const compactFontSize = width < 360 ? 9 : 10;
    chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    chartAxis.setAttribute("viewBox", `0 0 ${width} 42`);
    chart.setAttribute("height", String(height));
    chart.style.height = `${height}px`;
    grid.replaceChildren(); labels.replaceChildren(); lines.replaceChildren(); pointsLayer.replaceChildren(); chartAxis.replaceChildren();
    chartAxis.append(makeSvg("text", { x: 33, y: 26, class: "number-heading", "text-anchor": "middle" }, "竞彩编号"));
    mode.categories.forEach((category, index) => {
      const xx = x(index);
      grid.append(makeSvg("line", { x1: xx, y1: 0, x2: xx, y2: height - bottom, class: "lane" }));
      const labelWidth = category.length * (compactLabels ? compactFontSize : 12) + (compactLabels ? 4 : 10);
      const headerWidth = Math.min(labelWidth, columnGap - 2);
      chartAxis.append(makeSvg("text", {
        x: xx, y: 27, class: "x-label", "font-size": compactLabels ? compactFontSize : 12, "text-anchor": "middle"
      }, category));
      chartAxis.insertBefore(makeSvg("rect", {
        x: xx - headerWidth / 2, y: 7, width: headerWidth, height: 27, rx: 8, class: "category-badge"
      }), chartAxis.lastChild);
    });
    state.matches.forEach((match, index) => {
      const yy = y(index);
      const number = makeSvg("g", { class: "chart-match-number", "data-index": String(index), tabindex: "0", role: "button", "aria-label": `${match.code} ${match.home} 对 ${match.away}，查看战报` });
      number.append(
        makeSvg("rect", { x: 1, y: yy - 15, width: 62, height: 30, rx: 8, class: "number-chip" }),
        makeSvg("text", { x: 33, y: yy + 0.5, class: "y-label", "text-anchor": "middle" }, match.code)
      );
      labels.append(number);
      if (!mode.fact(match)) labels.append(makeSvg("text", { x: left, y: yy + 4, class: "pending-label" }, "暂无赛果"));
    });
    const categoryIndex = new Map(mode.categories.map((category, index) => [category, index]));
    const segments = [];
    let segment = [];
    state.matches.forEach((match, index) => {
      const value = mode.fact(match);
      if (categoryIndex.has(value)) segment.push({ match, index, value, x: x(categoryIndex.get(value)), y: y(index) });
      else if (segment.length) { segments.push(segment); segment = []; }
    });
    if (segment.length) segments.push(segment);
    for (const points of segments) {
      if (points.length > 1) {
        const coordinates = points.map(point => `${point.x},${point.y}`).join(" ");
        lines.append(makeSvg("polyline", { points: coordinates, class: "normal-line-halo", fill: "none", "aria-hidden": "true" }));
        lines.append(makeSvg("polyline", { points: coordinates, class: "normal-line", fill: "none" }));
      }
      points.forEach(point => {
        const fontSize = compactLabels ? 9.5 : 12;
        const badgeWidth = compactLabels ? Math.max(20, Math.min(26, point.value.length * fontSize + 4)) : Math.max(30, point.value.length * fontSize + 10);
        const node = makeSvg("g", {
          class: "normal-point trend-node", tabindex: "0", role: "button",
          "aria-label": `${point.match.code} ${mode.title} ${point.value}，跳转到比赛信息`, "data-index": String(point.index)
        });
        node.append(
          makeSvg("rect", { x: point.x - Math.max(18, badgeWidth / 2), y: point.y - 18, width: Math.max(36, badgeWidth), height: 36, fill: "transparent" }),
          makeSvg("rect", { x: point.x - badgeWidth / 2, y: point.y - 13, width: badgeWidth, height: 26, rx: 9, class: "node-badge" }),
          makeSvg("text", { x: point.x, y: point.y + 0.5, class: "node-label", "font-size": fontSize }, point.value)
        );
        pointsLayer.append(node);
      });
    }
    root.querySelector(".trend-section").style.setProperty("--chart-series", mode.color);
  }
  function renderMatches({ history = "replace" } = {}) {
    matchList.replaceChildren(...state.matches.map(renderMatch));
    matchList.hidden = !state.matches.length;
    root.querySelector("#empty-day").hidden = Boolean(state.matches.length);
    root.querySelector(".chart-shell").hidden = !state.matches.length;
    updateHeader(); updateSummary(); updateActiveResults(); renderChart();
    dateSelect.value = state.date;
    updateCanonicalUrl({ replace: history !== "push" });
  }
  function focusMatch(index) {
    const item = matchList.querySelector(`[data-index="${index}"]`);
    if (!item) return;
    matchList.querySelectorAll(".match-item.is-highlighted").forEach(node => node.classList.remove("is-highlighted"));
    item.classList.add("is-highlighted");
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => item.classList.remove("is-highlighted"), 1800);
  }
  function updateCanonicalUrl({ replace = true } = {}) {
    const url = new URL(window.location.href);
    url.searchParams.set("date", state.date);
    url.searchParams.set("mode", state.mode);
    if (url.href === window.location.href) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  }
  function chooseDate(date, { announce = true } = {}) {
    const day = state.days.find(item => item.date === date);
    if (!day) return;
    state.date = day.date;
    state.matches = Array.isArray(day.matches) ? [...day.matches].sort((a, b) => String(a.code).localeCompare(String(b.code), "zh-CN", { numeric: true })) : [];
    renderDateOptions();
    if (announce && !state.matches.length) setStatus(`${core.dateLabel(day.date)}暂无比赛记录。`, "empty");
    else if (state.matches.length) setStatus("");
    renderMatches({ history: announce ? "push" : "replace" });
  }
  function syncUrlState() {
    const url = new URL(window.location.href);
    const requestedMode = url.searchParams.get("mode");
    const mode = modes[requestedMode] ? requestedMode : "normal";
    const requestedDate = url.searchParams.get("date");
    const requestedDay = core.isDateKey(requestedDate) && state.days.some(day => day.date === requestedDate) ? requestedDate : "";
    state.mode = mode;
    const fallback = state.days.find(day => day.matches.length) || state.days[0];
    chooseDate(requestedDay || fallback.date, { announce: false });
    setMode(mode, false);
    if (requestedDate && !requestedDay) setStatus("分享链接中的日期当前不可用，已显示最新可用日期。", "warning");
    else if (!state.matches.length) setStatus(`${core.dateLabel(state.date)}暂无比赛记录。`, "empty");
  }
  function setMode(modeName, updateUrl = true) {
    if (!modes[modeName]) return;
    state.mode = modeName;
    tabs.forEach(tab => {
      const active = tab.dataset.mode === modeName;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    root.querySelector("#trend-title").textContent = modes[modeName].title + "走势";
    root.querySelector("#chart-title").textContent = modes[modeName].title + "走势";
    root.querySelector("#legend-label").textContent = modes[modeName].categories.join(" / ");
    if (state.matches.length) root.querySelector("#chart-desc").textContent = `${core.dateLabel(state.date)}，${state.matches.length}场比赛按竞彩编号从上到下排列，展示${modes[modeName].title}；无赛果场次不参与连线。`;
    updateSummary(); updateActiveResults(); renderChart();
    if (state.date) document.title = `${core.dateLabel(state.date)} · ${modes[state.mode].title}走势`;
    if (updateUrl && state.date) updateCanonicalUrl({ replace: false });
  }
  function renderDateOptions() {
    const latestDate = state.days.some(day => day.date === state.archive?.latestDate) ? state.archive.latestDate : state.days[0]?.date;
    const olderDay = !state.visibleDays.some(day => day.date === state.date) ? state.days.find(day => day.date === state.date) : null;
    const options = olderDay ? [olderDay, ...state.visibleDays] : state.visibleDays;
    dateSelect.replaceChildren(...options.map(day => {
      const text = `${core.dateLabel(day.date)} · ${day.matches.length}场${day.date === latestDate ? " · 最新" : day === olderDay ? " · 分享链接" : ""}`;
      return make("option", { value: day.date }, text);
    }));
  }
  function validArchive(archive) {
    return Boolean(archive && Array.isArray(archive.days) && archive.days.every(day => core.isDateKey(day?.date) && Array.isArray(day.matches) && day.matches.every(match => match && typeof match === "object" && typeof match.code === "string")));
  }
  async function loadArchive() {
    shareButton.disabled = true;
    dateSelect.disabled = true;
    root.setAttribute("aria-busy", "true");
    root.querySelector(".chart-shell").hidden = true;
    root.querySelector("#share-fallback").hidden = true;
    setStatus("正在读取赛果…", "loading");
    try {
      const response = await fetch(new URL("data/archive.json", document.baseURI), { cache: "no-cache", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const archive = await response.json();
      if (!validArchive(archive)) throw new Error("赛果归档格式无效");
      state.archive = archive;
      state.days = [...archive.days].sort((a, b) => b.date.localeCompare(a.date));
      state.visibleDays = state.days.slice(0, 14);
      if (!state.days.length) {
        renderDateOptions();
        state.date = ""; state.matches = [];
        matchList.replaceChildren(); matchList.hidden = true;
        root.querySelector("#empty-day").hidden = false;
        root.querySelector("#empty-day p").textContent = "暂无可展示的赛果数据。";
        root.querySelector(".eyebrow").textContent = "竞彩赛果 · 暂无归档";
        root.querySelector(".headline-total strong").textContent = "0";
        root.querySelector(".headline-total span").textContent = "场比赛";
        dateSelect.disabled = true; shareButton.disabled = true;
        setStatus("目前没有可读取的赛果日期。", "empty");
        return;
      }
      renderDateOptions();
      dateSelect.disabled = false;
      shareButton.disabled = false;
      syncUrlState();
    } catch (error) {
      console.error("读取竞彩赛果失败", error);
      dateSelect.disabled = true;
      matchList.replaceChildren(); matchList.hidden = true;
      root.querySelector("#empty-day").hidden = false;
      root.querySelector("#empty-day p").textContent = "暂时无法加载赛果，请检查网络后重试。";
      shareButton.disabled = true;
      setStatus("赛果加载失败。", "error", make("button", { class: "status-action", type: "button" }, "重试"));
      status.querySelector("button")?.addEventListener("click", loadArchive);
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }
  async function refreshArchiveIfChanged() {
    if (!state.archive || refreshingArchive || document.visibilityState === "hidden") return;
    refreshingArchive = true;
    try {
      const response = await fetch(new URL("data/archive.json", document.baseURI), { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const archive = await response.json();
      if (!validArchive(archive)) return;
      state.archive = archive;
      state.days = [...archive.days].sort((a, b) => b.date.localeCompare(a.date));
      state.visibleDays = state.days.slice(0, 14);
      renderDateOptions();
      const selectedDay = state.days.find(day => day.date === state.date);
      if (!selectedDay) syncUrlState();
      else if (JSON.stringify(selectedDay.matches) !== JSON.stringify(state.matches)) chooseDate(state.date, { announce: false });
    } catch (_) {
      // Keep the last good snapshot visible when a background refresh fails.
    } finally {
      refreshingArchive = false;
    }
  }
  async function fallbackCopy(url) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch (_) { /* Use the visible manual-copy fallback below. */ }
    const input = make("input", { class: "copy-fallback", type: "text", readonly: "", "aria-label": "可手动复制的分享链接" });
    input.value = url;
    root.querySelector("#share-fallback").replaceChildren(input, make("button", { type: "button", class: "status-action" }, "全选链接"));
    const wrapper = root.querySelector("#share-fallback");
    wrapper.hidden = false;
    wrapper.querySelector("button").addEventListener("click", () => { input.focus(); input.select(); input.setSelectionRange(0, input.value.length); });
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
    return false;
  }
  async function share() {
    if (!state.date) return;
    root.querySelector("#share-fallback").hidden = true;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("date", state.date);
    url.searchParams.set("mode", state.mode);
    url.hash = "";
    const shareData = { title: `${core.dateLabel(state.date)}竞彩足球走势`, text: `${core.dateLabel(state.date)} · ${modes[state.mode].title}走势图`, url: url.href };
    try {
      if (navigator.share) { await navigator.share(shareData); setStatus("分享面板已打开。", "success"); return; }
      if (await fallbackCopy(url.href)) setStatus("分享链接已复制。", "success");
      else setStatus("无法自动复制；链接已选中，请手动复制。", "warning");
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error("分享失败", error);
      if (await fallbackCopy(url.href)) setStatus("分享功能不可用，链接已复制。", "warning");
      else setStatus("分享功能不可用；链接已选中，请手动复制。", "warning");
    }
  }

  dateSelect.addEventListener("change", () => chooseDate(dateSelect.value));
  chart.addEventListener("click", event => {
    const target = event.target.closest("[data-index]");
    if (target) focusMatch(Number(target.dataset.index));
  });
  chart.addEventListener("keydown", event => {
    const target = event.target.closest("[data-index]");
    if (target && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); focusMatch(Number(target.dataset.index)); }
  });
  shareButton.addEventListener("click", share);
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next].focus(); setMode(tabs[next].dataset.mode);
    });
  });
  window.addEventListener("popstate", () => { if (state.days.length) syncUrlState(); });
  window.setInterval(refreshArchiveIfChanged, 30_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refreshArchiveIfChanged(); });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => requestAnimationFrame(renderChart)).observe(chartWrap);
  window.addEventListener("resize", () => requestAnimationFrame(renderChart), { passive: true });
  loadArchive();
})();
