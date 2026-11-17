/**
 * Parser for the classic ServiceNow `stats.do` diagnostics page.
 *
 * stats.do is loosely structured HTML: `<hr/><strong>Title</strong>` starts a
 * major section, `<b>Name</b>` or a `Label:` line with no value starts a
 * sub-group, and the data is `Label: value` lines separated by <br/>. Fields
 * vary by release, so this walks the document in order and keeps everything
 * rather than hard-coding field names. Browser-only: callers pass a Document
 * produced by DOMParser.
 *
 * Model: sections[] -> groups[] -> {items, notes, tables}
 */

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'PRE', 'SECTION',
  'ARTICLE', 'FORM', 'FIELDSET', 'CENTER', 'BLOCKQUOTE', 'TR', 'TD', 'TH'
]);
const MAJOR_TAGS = new Set(['STRONG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const MINOR_TAGS = new Set(['B']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'BUTTON', 'SELECT', 'INPUT']);
const SKIP_LINES = /^(details|refresh)$/i;

const NBSP = String.fromCharCode(0xa0);
const clean = s => (s || '').split(NBSP).join(' ').replace(/\s+/g, ' ').trim();
const stripColon = s => s.replace(/\s*:\s*$/, '');

// "1 minute: 0:00:00.030 (8 transactions, 8.0 per minute, 90% faster than 0:00:00.122)"
const WINDOW_LABEL = /^\d+\s+(minute|minutes|hour|hours|day|days)$/i;
const TIMING_VALUE =
  /^([\d:.]+)\s*\(\s*([\d,]+)\s+transactions?,\s*([\d.,]+)\s+per\s+minute,\s*(\d+)%\s+faster\s+than\s+([\d:.]+)\s*\)/i;

/** @param {Element} table */
function rowsOf(table) {
  return Array.from(table.querySelectorAll('tr')).filter(r => r.closest('table') === table);
}
function cellsOf(row) {
  return Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
}
function isLayoutTable(table) {
  if (table.querySelector('table')) return true;
  const rows = rowsOf(table);
  return rows.length === 0 || (rows.length === 1 && cellsOf(rows[0]).length <= 1);
}
function readTable(table) {
  const rows = rowsOf(table)
    .map(r => {
      const cells = cellsOf(r);
      return {
        isHeader: cells.length > 0 && cells.every(c => c.tagName === 'TH'),
        cells: cells.map(c => clean(c.textContent))
      };
    })
    .filter(r => r.cells.some(Boolean));
  const captionEl = Array.from(table.children).find(c => c.tagName === 'CAPTION');
  const caption = clean(captionEl?.textContent);
  const headerIdx = rows.findIndex(r => r.isHeader);
  const headers = headerIdx >= 0 ? rows[headerIdx].cells : [];
  const body = rows.filter((r, i) => i !== headerIdx && !r.isHeader).map(r => r.cells);
  if (!headers.length && body.length && body.every(r => r.length === 2)) {
    return {kind: 'items', caption, items: body.map(([label, value]) => ({label: stripColon(label), value}))};
  }
  return {kind: 'table', caption, headers, rows: body};
}

/**
 * Turns a group whose items are all response-time windows into a table.
 * @param {object} group
 * @param {string[]} timingHeaders  translated column headers (5)
 */
function timingTable(group, timingHeaders) {
  if (group.items.length < 2) return;
  const parsed = group.items.map(i => (WINDOW_LABEL.test(i.label) ? i.value.match(TIMING_VALUE) : null));
  if (parsed.some(m => !m)) return;
  group.tables.push({
    caption: group.title,
    headers: timingHeaders,
    numeric: true,
    rows: group.items.map((i, idx) => {
      const m = parsed[idx];
      return [i.label, m[1], m[2], m[3], m[5]];
    })
  });
  group.items = [];
}

/**
 * @param {Document} doc
 * @param {{timingHeaders?: string[]}} [options]
 */
export function parseStats(doc, options = {}) {
  const timingHeaders = options.timingHeaders || [
    'Window', 'Average', 'Transactions', 'Per minute', '90th percentile'
  ];
  const sections = [];
  let section = null;
  let group = null;

  let line = '';
  let lineKind = null; // 'major' | 'minor' | 'link' | 'text' | null
  let lineHref = '';

  const newSection = title => {
    section = {id: `s${sections.length}`, title, groups: []};
    sections.push(section);
    group = null;
    return section;
  };
  const newGroup = title => {
    if (!section) newSection('');
    group = {id: `${section.id}g${section.groups.length}`, title, items: [], notes: [], tables: []};
    section.groups.push(group);
    return group;
  };
  const currentGroup = () => group || newGroup('');

  const markText = kind => {
    if (lineKind === null) lineKind = kind;
    else if (lineKind !== kind) lineKind = 'text';
  };

  const flush = () => {
    const text = clean(line);
    const kind = lineKind;
    const href = lineHref;
    line = '';
    lineKind = null;
    lineHref = '';
    if (!text || SKIP_LINES.test(text)) return;

    if (kind === 'major') {
      newSection(stripColon(text));
      return;
    }
    if (kind === 'minor') {
      newGroup(stripColon(text));
      return;
    }
    if (kind === 'link') {
      // Internal links on their own line name a thread/worker; skip external links.
      if (!/^https?:/i.test(href)) newGroup(text);
      return;
    }
    if (/:$/.test(text)) {
      newGroup(stripColon(text));
      return;
    }
    const m = text.match(/^([^:]{1,80}?)\s*:\s*(.+)$/);
    if (m) currentGroup().items.push({label: m[1], value: m[2]});
    else currentGroup().notes.push(text);
  };

  const walk = (node, ctx) => {
    if (node.nodeType === 3) {
      const t = node.nodeValue || '';
      if (t.trim()) {
        line += t;
        markText(ctx);
      } else if (t) {
        line += ' ';
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'BR' || tag === 'HR') {
      flush();
      return;
    }
    if (tag === 'TABLE' && !isLayoutTable(node)) {
      flush();
      const parsed = readTable(node);
      const g = parsed.caption ? newGroup(parsed.caption) : currentGroup();
      if (parsed.kind === 'items') g.items.push(...parsed.items);
      else if (parsed.rows.length || parsed.headers.length) g.tables.push(parsed);
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag) || tag === 'TABLE';
    if (isBlock) flush();
    let childCtx = ctx;
    if (MAJOR_TAGS.has(tag)) childCtx = 'major';
    else if (MINOR_TAGS.has(tag) && ctx === 'text') childCtx = 'minor';
    else if (tag === 'A' && ctx === 'text') {
      childCtx = 'link';
      lineHref = node.getAttribute('href') || '';
    }
    for (const child of node.childNodes) walk(child, childCtx);
    if (isBlock || MAJOR_TAGS.has(tag)) flush();
  };

  if (doc?.body) walk(doc.body, 'text');
  flush();

  for (const s of sections) {
    let parent = null;
    const merged = [];
    for (const g of s.groups) {
      timingTable(g, timingHeaders);
      g.notes = g.notes.filter(n => !/^&\w+;?$/.test(n));
      // "Default Response Time" etc. belong to the preceding "Default" group.
      const tablesOnly = !g.items.length && !g.notes.length && g.tables.length;
      if (tablesOnly && parent && parent.title && g.title.startsWith(`${parent.title} `)) {
        parent.tables.push(...g.tables);
        continue;
      }
      if (g.items.length || g.notes.length || g.tables.length) {
        merged.push(g);
        if (g.items.length) parent = g;
      }
    }
    s.groups = merged;
  }
  return {
    title: clean(doc?.title),
    sections: sections.filter(s => s.groups.length)
  };
}

/** Pulls a leading number out of strings like "1,024 MB" or "45.2%". */
export function toNumber(value) {
  const m = String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function* allItems(sections) {
  for (const s of sections) {
    for (const g of s.groups) {
      for (const i of g.items) yield {section: s.title, group: g.title, ...i};
    }
  }
}

const find = (sections, labelRe, sectionRe) => {
  for (const i of allItems(sections)) {
    if (labelRe.test(i.label) && (!sectionRe || sectionRe.test(i.section))) return i;
  }
  return null;
};

const MONTHS = {jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11};
/**
 * Parses Java Date#toString output ("Sun Nov 15 00:26:40 PST 2026") into a
 * comparable timestamp. The zone is ignored, so only differences between two
 * values from the same page are meaningful.
 */
export function parseJavaDate(value) {
  const m = String(value || '').match(/([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(?:\S+\s+)?(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  return Date.UTC(Number(m[6]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

/**
 * Derives the headline KPIs. Every field is optional (releases differ), so
 * consumers must hide tiles whose value is null.
 */
export function deriveKpis(sections) {
  const statsFor = find(sections, /^statistics\s+for$/i);
  const capturedAt = statsFor ? parseJavaDate(statsFor.value.split(/\bat:/i)[1]) : null;
  const started = find(sections, /^(servlet\s+)?started$/i, /servlet|^$/i);
  const uptimeItem = find(sections, /uptime/i);
  const startedAt = started ? parseJavaDate(started.value) : null;
  const uptimeMs = capturedAt && startedAt && capturedAt >= startedAt ? capturedAt - startedAt : null;

  const sessions =
    find(sections, /^logged[\s-]*in\s+sessions$/i) ||
    find(sections, /^count$/i, /logged\s+in\s+sessions/i);
  const transactions = find(sections, /^transactions$/i, /servlet/i);
  const errors = find(sections, /^errors(\s+handled)?$/i, /servlet/i);

  const node = find(sections, /cluster\s+node/i) || find(sections, /^node(\s+id|\s+name)?$/i);
  const build = find(sections, /^build\s+name$/i);
  const buildTag = find(sections, /^build\s+tag$/i);

  let memoryPct = null;
  const freePct = find(sections, /free\s+percent/i, /memory/i);
  const max = find(sections, /^max(imum)?(\s+memory)?$/i, /memory/i);
  const inUse = find(sections, /^(in\s+use|used)$/i, /memory/i);
  if (freePct && !Number.isNaN(toNumber(freePct.value))) {
    memoryPct = 100 - toNumber(freePct.value);
  } else if (max && inUse && toNumber(max.value) > 0) {
    memoryPct = (toNumber(inUse.value) / toNumber(max.value)) * 100;
  }
  if (memoryPct !== null) memoryPct = Math.min(100, Math.max(0, memoryPct));

  return {
    uptimeMs,
    uptimeText: uptimeItem?.value ?? null,
    started: started?.value ?? null,
    sessions: sessions?.value ?? null,
    transactions: transactions?.value ?? null,
    errors: errors?.value ?? null,
    memoryPct,
    memoryInUse: inUse?.value ?? null,
    memoryMax: max?.value ?? null,
    node: node?.value ?? null,
    build: build?.value ?? null,
    buildTag: buildTag?.value ?? null
  };
}

/** Tab grouping by section title. Anything unmatched lands in Overview. */
export const TAB_RULES = [
  {id: 'transactions', re: /transaction|response\s+time|processing\s+time|network\s+time|browser\s+time|servlet\s+statistics/i},
  {id: 'semaphores', re: /semaphore|thread|worker|scheduler|queue|pool|writer|metricbase|virtual\s+agent/i},
  {id: 'memory', re: /memory|session|heap|garbage|\bgc\b/i}
];

export function tabForSection(section) {
  const rule = TAB_RULES.find(r => r.re.test(section.title));
  return rule ? rule.id : 'overview';
}

/** Severity for a live queue/rejection metric (historical "max" values are ignored). */
export function valueSeverity(label, value) {
  if (/max|limit|age/i.test(label)) return null;
  const n = toNumber(value);
  if (Number.isNaN(n) || n <= 0) return null;
  if (/reject|fail|abort|overflow/i.test(label)) return 'error';
  if (/queue\s+(depth|size)|^length$|waiting|pending/i.test(label)) return 'warning';
  return null;
}
