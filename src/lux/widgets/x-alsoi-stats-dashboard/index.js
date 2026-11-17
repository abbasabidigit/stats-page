import {html, css, nothing, isServer} from 'lit';
import {customElement} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {
  AIUXWidgetElement,
  aiuxFetch,
  getLogger,
  decorators
} from '@servicenow/aiux/aiux-components-core';
import {i18n} from '@servicenow/aiux/aiux-services';
import {icon} from '@servicenow/aiux/aiux-directive-icon';
import '@servicenow/aiux/aiux-components-tabs';
import '@servicenow/aiux/aiux-components-loader';
import '@servicenow/aiux/aiux-components-alert';
import '@servicenow/aiux/aiux-components-empty-state-content';
import {
  parseStats,
  deriveKpis,
  tabForSection,
  valueSeverity,
  toNumber
} from './parse-stats.js';

const {name, description, bestFor, category, discoverable, chatCompatible, acl} =
  decorators;

const log = getLogger('x-alsoi-stats-dashboard');
const STATS_URL = '/stats.do';
const REFRESH_OPTIONS = [0, 30, 60];
/** Sections with more groups than this render each group as a disclosure. */
const COLLAPSE_AFTER = 3;

@customElement('x-alsoi-stats-dashboard')
@name('System Stats Dashboard')
@description(
  'Shows the instance diagnostics from stats.do (build, node, memory, sessions, semaphores, transactions) as a modern, searchable dashboard.'
)
@bestFor(
  'Admin diagnostics pages that need a readable, auto-refreshing view of the current node statistics reported by stats.do.'
)
@chatCompatible(false)
@category('custom')
@discoverable(true)
@acl([{roles: ['admin']}])
export default class StatsDashboard extends AIUXWidgetElement {
  static properties = {
    _loading: {type: Boolean, state: true},
    _refreshing: {type: Boolean, state: true},
    _error: {type: String, state: true},
    _sections: {type: Array, state: true},
    _kpis: {type: Object, state: true},
    _activeTab: {type: String, state: true},
    _filter: {type: String, state: true},
    _interval: {type: Number, state: true},
    _updatedAt: {type: Object, state: true},
    _announcement: {type: String, state: true}
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      container-type: inline-size;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .meter {
      height: 0.5rem;
      border-radius: 9999px;
      background: var(--color-base-300);
      overflow: hidden;
    }
    .meter > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--color-success);
      transition: width var(--duration-moderate, 200ms) linear;
    }
    .meter.warn > span {
      background: var(--color-warning);
    }
    .meter.crit > span {
      background: var(--color-error);
    }
    details > summary {
      list-style: none;
      cursor: pointer;
    }
    details > summary::-webkit-details-marker {
      display: none;
    }
    details > summary .chevron {
      transition: transform var(--duration-moderate, 200ms) var(--ease-standard, ease);
    }
    details[open] > summary .chevron {
      transform: rotate(90deg);
    }
    :host(:dir(rtl)) details:not([open]) > summary .chevron {
      transform: scaleX(-1);
    }
    @media (prefers-reduced-motion: reduce) {
      .meter > span,
      details > summary .chevron {
        transition: none;
      }
    }
    @media (forced-colors: active) {
      .meter {
        border: 1px solid CanvasText;
      }
      .meter > span {
        background: Highlight;
      }
      .tile,
      .section-card,
      details {
        border: 1px solid CanvasText;
      }
    }
  `;

  constructor() {
    super();
    this._loading = true;
    this._refreshing = false;
    this._error = '';
    this._sections = [];
    this._kpis = null;
    this._activeTab = 'overview';
    this._filter = '';
    this._interval = 0;
    this._updatedAt = null;
    this._announcement = '';
    this._fetching = false;
    this._timer = null;
    this._abort = null;
    this._load = this._load.bind(this);
    this._onRefreshClick = this._onRefreshClick.bind(this);
    this._onIntervalChange = this._onIntervalChange.bind(this);
    this._onFilterInput = this._onFilterInput.bind(this);
    this._onTabChange = this._onTabChange.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    if (!isServer) {
      this._load();
      this._applyInterval();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTimer();
    this._abort?.abort();
  }

  // ---------- data ----------

  async _load() {
    if (this._fetching) return;
    this._fetching = true;
    if (this._sections.length) this._refreshing = true;
    else this._loading = true;
    this._abort = new AbortController();
    try {
      const resp = await aiuxFetch(STATS_URL, {
        headers: {Accept: 'text/html'},
        signal: this._abort.signal
      });
      if (resp.status === 401 || resp.status === 403) {
        this._error = i18n.getMessage(
          'You do not have access to stats.do. The admin role is required.'
        );
        return;
      }
      if (!resp.ok) {
        log.error({status: resp.status}, 'stats.do request failed');
        this._error = i18n.getMessage('Unable to load system statistics.');
        return;
      }
      const text = await resp.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      if (doc.querySelector('form[action*="login"], #user_password')) {
        this._error = i18n.getMessage(
          'Your session has expired. Sign in again to view system statistics.'
        );
        return;
      }
      const {sections} = parseStats(doc, {
        timingHeaders: [
          i18n.getMessage('Window'),
          i18n.getMessage('Average'),
          i18n.getMessage('Transactions'),
          i18n.getMessage('Per minute'),
          i18n.getMessage('90th percentile')
        ]
      });
      this._sections = sections;
      this._kpis = deriveKpis(sections);
      this._error = '';
      this._updatedAt = new Date();
      this._announcement = i18n.getMessage('Statistics updated at {0}', [
        this._formatTime(this._updatedAt)
      ]);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      log.error({error: e?.message}, 'stats.do parse/fetch error');
      this._error = i18n.getMessage('Unable to load system statistics.');
    } finally {
      this._loading = false;
      this._refreshing = false;
      this._fetching = false;
    }
  }

  _applyInterval() {
    this._clearTimer();
    if (this._interval > 0) {
      this._timer = setInterval(this._load, this._interval * 1000);
    }
  }

  _clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ---------- events ----------

  _onRefreshClick() {
    this._load();
  }

  _onIntervalChange(e) {
    this._interval = Number(e.target.value) || 0;
    this._applyInterval();
  }

  _onFilterInput(e) {
    this._filter = e.target.value;
  }

  _onTabChange(e) {
    this._activeTab = e.detail.id;
  }

  // ---------- helpers ----------

  _formatTime(date) {
    try {
      return new Intl.DateTimeFormat(undefined, {timeStyle: 'medium'}).format(date);
    } catch {
      return date.toLocaleTimeString();
    }
  }

  _formatPercent(value) {
    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumFractionDigits: 1
    }).format(value / 100);
  }

  /** Formats plain integers ("180141") with locale grouping; leaves other text untouched. */
  _formatCount(value) {
    if (!/^\d+$/.test(String(value).trim())) return value;
    return new Intl.NumberFormat().format(Number(value));
  }

  _formatDuration(ms) {
    const total = Math.floor(ms / 60000);
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const minutes = total % 60;
    return days > 0
      ? i18n.getMessage('{0}d {1}h {2}m', [days, hours, minutes])
      : i18n.getMessage('{0}h {1}m', [hours, minutes]);
  }

  _tabSections(tabId) {
    if (tabId === 'all') return this._sections;
    return this._sections.filter(s => tabForSection(s) === tabId);
  }

  _filtered(sections) {
    const q = this._filter.trim().toLowerCase();
    if (!q) return sections;
    const has = v => String(v).toLowerCase().includes(q);
    const filterGroup = g => {
      if (has(g.title)) return g;
      return {
        ...g,
        items: g.items.filter(i => has(i.label) || has(i.value)),
        notes: g.notes.filter(has),
        tables: g.tables
          .map(t => (has(t.caption) ? t : {...t, rows: t.rows.filter(r => r.some(has))}))
          .filter(t => t.rows.length)
      };
    };
    return sections
      .map(s => (has(s.title) ? s : {...s, groups: s.groups.map(filterGroup)}))
      .map(s => ({
        ...s,
        groups: s.groups.filter(g => g.items.length || g.notes.length || g.tables.length)
      }))
      .filter(s => s.groups.length);
  }

  // ---------- render ----------

  render() {
    return html`
      <div class="flex flex-col gap-4">
        ${this._renderHeader()}
        <span class="sr-only" role="status" aria-live="polite">${this._announcement}</span>
        ${this._renderBody()}
      </div>
    `;
  }

  _renderHeader() {
    const busy = this._loading || this._refreshing;
    return html`
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold text-text-primary break-words">
            ${i18n.getMessage('System statistics')}
          </h1>
          <p class="text-sm text-text-secondary break-words">
            ${this._updatedAt
              ? i18n.getMessage('Last updated {0}', [this._formatTime(this._updatedAt)])
              : i18n.getMessage('Live diagnostics for the node serving this session')}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="aiux-select aiux-select-sm w-auto">
            <span class="aiux-label">${i18n.getMessage('Auto refresh')}</span>
            <select .value=${String(this._interval)} @change=${this._onIntervalChange}>
              ${REFRESH_OPTIONS.map(
                s => html`<option value=${s} ?selected=${s === this._interval}>
                  ${s === 0 ? i18n.getMessage('Off') : i18n.getMessage('Every {0}s', [s])}
                </option>`
              )}
            </select>
          </label>
          <button
            type="button"
            class="aiux-btn aiux-btn-sm aiux-btn-primary"
            ?disabled=${busy}
            aria-busy=${busy ? 'true' : 'false'}
            @click=${this._onRefreshClick}
          >
            ${busy
              ? html`<span class="aiux-loading aiux-loading-spinner aiux-loading-xs" aria-hidden="true"></span>`
              : icon({name: 'refresh', size: 'sm'})}
            ${i18n.getMessage('Refresh')}
          </button>
          <a
            class="aiux-btn aiux-btn-sm aiux-btn-ghost"
            href=${STATS_URL}
            target="_blank"
            rel="noopener"
          >
            ${icon({name: 'external-link', size: 'sm'})}
            ${i18n.getMessage('Classic view')}
            <span class="sr-only">${i18n.getMessage('(opens in a new tab)')}</span>
          </a>
        </div>
      </header>
    `;
  }

  _renderBody() {
    if (this._loading) {
      return html`
        <div class="flex min-h-64 items-center justify-center">
          <aiux-loader size="lg" label=${i18n.getMessage('Loading system statistics')}></aiux-loader>
        </div>
      `;
    }
    if (this._error && !this._sections.length) {
      return html`
        <aiux-alert-message
          type="error"
          alert-title=${i18n.getMessage('Statistics unavailable')}
          message=${this._error}
          .autofocusControls=${false}
        >
          <button type="button" class="aiux-btn aiux-btn-sm mt-2" @click=${this._onRefreshClick}>
            ${i18n.getMessage('Retry')}
          </button>
        </aiux-alert-message>
      `;
    }
    if (!this._sections.length) {
      return html`
        <div class="h-64">
          <aiux-empty-state-content
            icon="chart"
            heading-text=${i18n.getMessage('No statistics reported')}
            body-text=${i18n.getMessage('stats.do returned no readable data for this node.')}
          ></aiux-empty-state-content>
        </div>
      `;
    }
    return html`
      ${this._error
        ? html`<aiux-alert-message
            type="warning"
            message=${this._error}
            .autofocusControls=${false}
          ></aiux-alert-message>`
        : nothing}
      ${this._renderKpis()} ${this._renderTabs()}
    `;
  }

  _renderKpis() {
    const k = this._kpis || {};
    const tiles = [];

    if (k.uptimeMs !== null && k.uptimeMs !== undefined) {
      tiles.push(
        this._tile(
          'clock',
          i18n.getMessage('Uptime'),
          this._formatDuration(k.uptimeMs),
          k.started ? i18n.getMessage('Since {0}', [k.started]) : ''
        )
      );
    } else if (k.uptimeText) {
      tiles.push(this._tile('clock', i18n.getMessage('Uptime'), k.uptimeText));
    }

    if (k.sessions) {
      tiles.push(this._tile('users', i18n.getMessage('Logged-in sessions'), k.sessions));
    }

    if (k.memoryPct !== null && k.memoryPct !== undefined) {
      tiles.push(this._memoryTile(k));
    }

    if (k.transactions) {
      const errors = toNumber(k.errors);
      tiles.push(
        this._tile(
          'chart-line',
          i18n.getMessage('Transactions'),
          this._formatCount(k.transactions),
          k.errors ? i18n.getMessage('{0} errors handled', [this._formatCount(k.errors)]) : '',
          errors > 0 ? 'warning' : ''
        )
      );
    }

    if (k.node || k.build) {
      const buildText = [k.build, k.buildTag].filter(Boolean).join(' · ');
      tiles.push(
        this._tile(
          'server',
          k.node ? i18n.getMessage('Cluster node') : i18n.getMessage('Build'),
          k.node || k.build,
          k.node ? buildText : k.buildTag || '',
          '',
          true
        )
      );
    }

    if (!tiles.length) return nothing;
    return html`
      <ul
        class="grid grid-cols-1 gap-4 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-5"
        aria-label=${i18n.getMessage('Key metrics')}
      >
        ${tiles}
      </ul>
    `;
  }

  _memoryTile(k) {
    const level = k.memoryPct >= 90 ? 'crit' : k.memoryPct >= 75 ? 'warn' : 'ok';
    const badge = {crit: 'aiux-badge-error', warn: 'aiux-badge-warning', ok: 'aiux-badge-success'}[level];
    const pct = this._formatPercent(k.memoryPct);
    const detail =
      k.memoryInUse && k.memoryMax
        ? i18n.getMessage('{0} of {1} MB', [k.memoryInUse, k.memoryMax])
        : '';
    return html`
      <li class="tile aiux-card bg-base-100 shadow-sm min-w-0">
        <div class="aiux-card-body gap-2 p-4">
          <div class="flex items-center justify-between gap-2 text-text-secondary">
            <span class="flex items-center gap-2 text-sm">
              ${icon({name: 'chart-pie', size: 'sm'})} ${i18n.getMessage('Memory in use')}
            </span>
            <span class="aiux-badge aiux-badge-sm aiux-badge-soft ${badge}">${pct}</span>
          </div>
          <div
            class=${classMap({meter: true, warn: level === 'warn', crit: level === 'crit'})}
            role="meter"
            aria-label=${i18n.getMessage('Memory in use')}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${Math.round(k.memoryPct)}
            aria-valuetext=${pct}
          >
            <span style=${styleMap({width: `${k.memoryPct}%`})}></span>
          </div>
          ${detail ? html`<p class="text-xs text-text-tertiary break-words">${detail}</p>` : nothing}
        </div>
      </li>
    `;
  }

  _tile(iconName, label, value, sub = '', subTone = '', small = false) {
    return html`
      <li class="tile aiux-card bg-base-100 shadow-sm min-w-0">
        <div class="aiux-card-body gap-1 p-4">
          <span class="flex items-center gap-2 text-sm text-text-secondary">
            ${icon({name: iconName, size: 'sm'})} ${label}
          </span>
          <span
            class="${small ? 'text-sm' : 'text-xl'} font-semibold text-text-primary break-all"
          >${value}</span>
          ${sub
            ? html`<span
                class="text-xs break-all ${subTone === 'warning' ? 'text-warning' : 'text-text-tertiary'}"
              >${sub}</span>`
            : nothing}
        </div>
      </li>
    `;
  }

  _renderTabs() {
    const defs = [
      {id: 'overview', label: i18n.getMessage('Overview')},
      {id: 'memory', label: i18n.getMessage('Memory & sessions')},
      {id: 'semaphores', label: i18n.getMessage('Semaphores & workers')},
      {id: 'transactions', label: i18n.getMessage('Transactions')},
      {id: 'all', label: i18n.getMessage('All sections')}
    ].filter(t => t.id === 'all' || this._tabSections(t.id).length);

    const active = defs.some(t => t.id === this._activeTab) ? this._activeTab : defs[0].id;
    const tabs = defs.map(t => ({...t, content: t.id === active ? this._renderPanel(t.id) : ''}));

    return html`
      <div class="flex flex-col gap-3">
        <label class="aiux-input aiux-input-sm w-full max-w-sm">
          ${icon({name: 'magnifying-glass', size: 'sm'})}
          <input
            type="search"
            .value=${this._filter}
            placeholder=${i18n.getMessage('Filter statistics')}
            aria-label=${i18n.getMessage('Filter statistics')}
            @input=${this._onFilterInput}
          />
        </label>
        <aiux-tab-group
          tablist-label=${i18n.getMessage('Statistics sections')}
          variant="bordered"
          .activeTab=${active}
          .tabs=${tabs}
          @aiux-tab-group:tab-change=${this._onTabChange}
        ></aiux-tab-group>
      </div>
    `;
  }

  _renderPanel(tabId) {
    const sections = this._filtered(this._tabSections(tabId));
    if (!sections.length) {
      return html`
        <div class="h-48">
          <aiux-empty-state-content
            icon="magnifying-glass"
            heading-text=${i18n.getMessage('No matching statistics')}
            body-text=${i18n.getMessage('Try a different filter.')}
          ></aiux-empty-state-content>
        </div>
      `;
    }
    const filtering = Boolean(this._filter.trim());
    return html`
      <div class="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
        ${sections.map(s => this._renderSection(s, filtering))}
      </div>
    `;
  }

  _renderSection(section, filtering) {
    const collapsible = section.groups.length > COLLAPSE_AFTER;
    const wide = collapsible || section.groups.some(g => g.tables.length);
    const headingId = `h-${section.id}`;
    return html`
      <section
        class="section-card aiux-card bg-base-100 shadow-sm min-w-0 ${wide ? '@3xl:col-span-2' : ''}"
        aria-labelledby=${headingId}
      >
        <div class="aiux-card-body gap-3 p-4">
          <h2 id=${headingId} class="aiux-card-title text-base text-text-primary break-words">
            ${section.title || i18n.getMessage('Instance')}
            ${collapsible
              ? html`<span class="aiux-badge aiux-badge-sm aiux-badge-ghost font-normal">
                  ${this._formatCount(String(section.groups.length))}
                </span>`
              : nothing}
          </h2>
          ${collapsible
            ? html`<div class="grid grid-cols-1 gap-2 @5xl:grid-cols-2">
                ${section.groups.map(g => this._renderDisclosure(g, filtering))}
              </div>`
            : section.groups.map(g => this._renderGroup(g, true))}
        </div>
      </section>
    `;
  }

  _renderDisclosure(group, open) {
    const alerts = group.items
      .map(i => ({...i, sev: valueSeverity(i.label, i.value)}))
      .filter(i => i.sev);
    return html`
      <details class="rounded-box border border-base-300 min-w-0 self-start" ?open=${open}>
        <summary class="flex items-center gap-2 px-3 py-2 min-w-0">
          <span class="chevron flex">${icon({name: 'chevron-right', size: 'sm'})}</span>
          <span class="font-medium text-sm text-text-primary break-all">
            ${group.title || i18n.getMessage('General')}
          </span>
          ${alerts.length
            ? html`<span
                class="aiux-badge aiux-badge-sm aiux-badge-soft ms-auto ${alerts.some(a => a.sev === 'error') ? 'aiux-badge-error' : 'aiux-badge-warning'}"
              >${i18n.getMessage('{0} need attention', [alerts.length])}</span>`
            : nothing}
        </summary>
        <div class="flex flex-col gap-3 px-3 pb-3">${this._renderGroup(group, false)}</div>
      </details>
    `;
  }

  _renderGroup(group, showTitle) {
    return html`
      <div class="flex flex-col gap-2 min-w-0">
        ${showTitle && group.title
          ? html`<h3 class="text-sm font-semibold text-text-primary break-words">${group.title}</h3>`
          : nothing}
        ${group.items.length
          ? html`
              <dl class="grid grid-cols-1 gap-x-4 gap-y-1 @lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                ${group.items.map(i => this._renderItem(i))}
              </dl>
            `
          : nothing}
        ${group.tables.map(t => this._renderTable(t, group.title))}
        ${group.notes.map(n => html`<p class="text-sm text-text-secondary break-words">${n}</p>`)}
      </div>
    `;
  }

  _renderItem(item) {
    const sev = valueSeverity(item.label, item.value);
    return html`
      <dt class="text-sm text-text-secondary break-words">${item.label}</dt>
      <dd class="text-sm font-medium text-text-primary break-all mb-2 @lg:mb-0">
        ${sev
          ? html`<span class="aiux-badge aiux-badge-sm aiux-badge-soft ${sev === 'error' ? 'aiux-badge-error' : 'aiux-badge-warning'}">${item.value}</span>`
          : item.value}
      </dd>
    `;
  }

  _renderTable(table, fallbackCaption) {
    const caption = table.caption || fallbackCaption || i18n.getMessage('Statistics table');
    return html`
      <div class="overflow-x-auto rounded-box border border-base-300" role="region" aria-label=${caption}>
        <table class="aiux-table aiux-table-sm aiux-table-zebra">
          <caption class="text-start text-xs font-medium text-text-secondary px-3 pt-2">
            ${caption}
          </caption>
          ${table.headers.length
            ? html`<thead>
                <tr>
                  ${table.headers.map(
                    (h, i) => html`<th
                      scope="col"
                      class="whitespace-nowrap ${table.numeric && i > 0 ? 'text-end' : ''}"
                    >${h}</th>`
                  )}
                </tr>
              </thead>`
            : nothing}
          <tbody>
            ${table.rows.map(
              row => html`<tr>
                ${row.map((cell, ci) =>
                  ci === 0 && table.headers.length
                    ? html`<th scope="row" class="font-medium whitespace-nowrap">${cell}</th>`
                    : html`<td class="tabular-nums ${table.numeric ? 'text-end whitespace-nowrap' : ''}">
                        ${table.numeric ? this._formatCount(cell) : cell}
                      </td>`
                )}
              </tr>`
            )}
          </tbody>
        </table>
      </div>
    `;
  }
}
