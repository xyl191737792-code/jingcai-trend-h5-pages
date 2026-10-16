(() => {
  const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const allowed = {
    normal: ["胜", "平", "负"],
    handicap: ["让胜", "让平", "让负"],
    goals: ["0", "1", "2", "3", "4", "5", "6", "7+"],
    halfFull: ["胜胜", "胜平", "胜负", "平胜", "平平", "平负", "负胜", "负平", "负负"]
  };

  function isDateKey(value) {
    const parts = datePattern.exec(value || "");
    if (!parts) return false;
    const [, year, month, day] = parts.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function dateLabel(value) {
    if (!isDateKey(value)) return value || "";
    const [, year, month, day] = datePattern.exec(value);
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date(Date.UTC(+year, +month - 1, +day)).getUTCDay()];
    return `${year}年${+month}月${+day}日 周${weekday}`;
  }

  function parseScore(value) {
    if (typeof value !== "string" || !/^\d{1,2}:\d{1,2}$/.test(value)) return null;
    return value.split(":").map(Number);
  }

  function result(score) {
    const parsed = parseScore(score);
    if (!parsed) return null;
    return parsed[0] === parsed[1] ? "平" : parsed[0] > parsed[1] ? "胜" : "负";
  }

  function modeValue(match, mode) {
    const fullScore = parseScore(match?.score);
    if (!hasResult(match)) return null;
    if (mode === "normal") {
      const value = allowed.normal.includes(match.normal) ? match.normal : result(match.score);
      return allowed.normal.includes(value) ? value : null;
    }
    if (mode === "handicap") {
      if (allowed.handicap.includes(match.handicap)) return match.handicap;
      if (!/^[+-]?\d+$/.test(String(match.line ?? ""))) return null;
      const adjusted = fullScore[0] + Number(match.line);
      return adjusted === fullScore[1] ? "让平" : adjusted > fullScore[1] ? "让胜" : "让负";
    }
    const total = fullScore[0] + fullScore[1];
    if (mode === "goals") return total >= 7 ? "7+" : String(total);
    if (mode === "halfFull") {
      const half = result(match.half);
      return half ? half + result(match.score) : null;
    }
    return null;
  }

  function hasResult(match) {
    return Boolean(parseScore(match?.score)) && !/取消|腰斩|延期|中止|未赛|未开始|进行中|cancel|postpon|abandon|not.?started|scheduled|live|in.?progress/i.test(String(match?.status || match?.state || ""));
  }

  function kickoffDisplay(kickoff, fallbackDate = "") {
    const text = typeof kickoff === "string" ? kickoff.trim() : "";
    let date = isDateKey(fallbackDate) ? fallbackDate : "";
    let time = "";
    const zoned = /T\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
    if (zoned) {
      const instant = new Date(text);
      if (!Number.isNaN(instant.getTime())) {
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        }).formatToParts(instant).reduce((result, part) => (result[part.type] = part.value, result), {});
        date = `${parts.year}-${parts.month}-${parts.day}`;
        time = formatTime(parts.hour, parts.minute);
      }
    } else {
      const match = /^(?:(\d{4}-\d{2}-\d{2})[ T])?(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
      if (match) {
        if (!date && isDateKey(match[1])) date = match[1];
        time = formatTime(match[2], match[3]);
      }
    }
    return { date, time };
  }

  function formatTime(hour, minute) {
    const h = Number(hour);
    const m = Number(minute);
    if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return "";
    return m === 0 ? `${h}时` : `${h}时${m}分`;
  }

  const api = { allowed, dateLabel, hasResult, isDateKey, kickoffDisplay, modeValue, parseScore, result };
  if (typeof window !== "undefined") window.JingcaiTrendCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
