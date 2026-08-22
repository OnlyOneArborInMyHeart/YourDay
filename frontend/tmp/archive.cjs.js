// src/utils/archive.ts
var LINE_RE = /^-\s+\[x\]\s+(.+?)\s*$/;
function parseMeta(kind, payload) {
  const fields = {};
  for (const seg of payload.split(",")) {
    const eq = seg.indexOf("=");
    if (eq < 0) continue;
    fields[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
  }
  const id = Number(fields.id);
  const p = Number(fields.p) || 3;
  if (!Number.isInteger(id) || id <= 0) return null;
  const priority = p === 1 || p === 2 || p === 3 ? p : 3;
  if (kind === "todo") {
    return { kind: "todo", id, priority, title: "" };
  }
  return {
    kind: "event",
    id,
    priority,
    title: "",
    startTime: fields.st || null,
    endTime: fields.et || null
  };
}
function stripBracket(s) {
  return s.replace(/[（(][^）)]*[）)]\s*$/, "").trim();
}
function parseDiaryArchiveBlock(markdown, targetDate) {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const headerRe = new RegExp(`^##\\s+\u5B8C\u6210\u7684\u4E8B\u9879\\s*\\(${escapeRe(targetDate)}\\)\\s*$`);
  const out = [];
  let inSection = false;
  let pendingMeta = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inSection) {
      if (headerRe.test(line)) inSection = true;
      continue;
    }
    if (/^##\s+/.test(line) && !headerRe.test(line)) break;
    const metaMatch = /^<!--\s*a:(todo|event),([^>]+?)\s*-->$/.exec(line);
    if (metaMatch) {
      pendingMeta = parseMeta(metaMatch[1], metaMatch[2]);
      continue;
    }
    const listMatch = LINE_RE.exec(line);
    if (listMatch && pendingMeta) {
      const rawTitle = listMatch[1];
      const cleanTitle = stripBracket(rawTitle);
      pendingMeta.title = cleanTitle;
      out.push(pendingMeta);
      pendingMeta = null;
      continue;
    }
    if (line === "") pendingMeta = null;
  }
  return out;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export {
  parseDiaryArchiveBlock
};
