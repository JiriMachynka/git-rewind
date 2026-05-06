// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  window.addEventListener('error', (e) => {
    console.error('[git-rewind] error:', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[git-rewind] unhandled rejection:', e.reason);
  });

  const stripEl = document.getElementById('strip');
  const calloutEl = document.getElementById('callout');
  const stripWrap = document.getElementById('strip-wrap');
  const diffEl = document.getElementById('diff');
  const searchEl = document.getElementById('search');
  const searchCountEl = document.getElementById('search-count');
  const bannerEl = document.getElementById('banner');
  const pickaxeBtn = document.getElementById('pickaxe-btn');
  const pickaxePill = document.getElementById('pickaxe-pill');
  const pickaxeTermEl = document.getElementById('pickaxe-term');
  const pickaxeClearBtn = document.getElementById('pickaxe-clear');
  const comparePill = document.getElementById('compare-pill');
  const compareBaseShaEl = document.getElementById('compare-base-sha');
  const compareClearBtn = document.getElementById('compare-clear');
  const breadcrumbEl = document.getElementById('breadcrumb');

  /** @type {{commits: any[], filename: string, relPath: string, breadcrumb: string[]} | null} */
  let state = null;
  let activeSha = null;
  let filterQuery = '';
  /** @type {Set<string> | null} */
  let pickaxeShaSet = null;
  let pickaxeTerm = '';
  /** @type {string | null} */
  let compareBaseSha = null;

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'fatal') {
      console.error('[git-rewind] fatal:', m.message);
      return;
    }
    if (m.type === 'init') {
      state = { commits: m.commits, filename: m.filename, relPath: m.relPath, breadcrumb: m.breadcrumb || [] };
      renderBreadcrumb();
      renderStrip();
    } else if (m.type === 'commit') {
      activeSha = m.sha;
      renderStrip();
      renderCallout(m.stats, m.baseSha);
      renderBanner(m.isInitial, m.baseSha);
      renderDiff(m.lines, m.isInitial);
      requestAnimationFrame(positionCallout);
    } else if (m.type === 'step') {
      stepCommit(m.delta);
    } else if (m.type === 'pickaxeResult') {
      if (!m.term || m.shas == null) {
        pickaxeShaSet = null;
        pickaxeTerm = '';
        pickaxePill.hidden = true;
      } else {
        pickaxeShaSet = new Set(m.shas);
        pickaxeTerm = m.term;
        pickaxeTermEl.textContent = m.term;
        pickaxePill.hidden = false;
      }
      renderStrip();
    }
  });

  function stepCommit(delta) {
    if (!state || !activeSha) return;
    const idx = state.commits.findIndex((c) => c.sha === activeSha);
    if (idx < 0) return;
    const target = state.commits[Math.max(0, Math.min(state.commits.length - 1, idx - delta))];
    if (target && target.sha !== activeSha) select(target.sha);
  }

  function renderBreadcrumb() {
    if (!state || !breadcrumbEl) return;
    const segs = state.breadcrumb || [];
    if (segs.length === 0) { breadcrumbEl.innerHTML = ''; return; }
    const parts = [];
    segs.forEach((seg, i) => {
      if (i > 0) parts.push(`<span class="sep">›</span>`);
      const isLast = i === segs.length - 1;
      parts.push(`<span class="crumb${isLast ? ' last' : ''}" data-i="${i}">${esc(seg)}</span>`);
    });
    breadcrumbEl.innerHTML = parts.join('');
  }

  function renderStrip() {
    if (!state) return;
    const q = filterQuery.trim().toLowerCase();
    const filtered = state.commits.filter((c) => {
      if (pickaxeShaSet && !pickaxeShaSet.has(c.sha)) return false;
      if (!q) return true;
      return (
        c.subject.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.sha.toLowerCase().includes(q)
      );
    });

    const filtersOn = q || pickaxeShaSet;
    searchCountEl.textContent = filtersOn
      ? `${filtered.length}/${state.commits.length}`
      : `${state.commits.length} commits`;

    if (filtered.length === 0) {
      stripEl.innerHTML = `<div style="padding: 18px; color: var(--vscode-descriptionForeground); font-size: 12px;">No matching commits</div>`;
      return;
    }

    const html = [];
    for (let i = filtered.length - 1; i >= 0; i--) {
      const c = filtered[i];
      const active = c.sha === activeSha ? ' active' : '';
      const base = c.sha === compareBaseSha ? ' compare-base' : '';
      const dateStr = friendlyDate(new Date(c.date));
      const ccAttr = c.ccType ? ` data-cc="${esc(c.ccType)}"` : '';
      const ccBreaking = c.ccBreaking ? ` data-cc-breaking="true"` : '';
      const renameAttr = c.oldPath ? ' data-renamed="true"' : '';
      const renameTitle = c.oldPath ? `\n\nRenamed from ${c.oldPath}` : '';
      html.push(
        `<div class="node${active}${base}"${ccAttr}${ccBreaking}${renameAttr} data-sha="${esc(c.sha)}" tabindex="0" title="${esc(c.subject)}${esc(renameTitle)}\n\nClick to view · Alt-click to set as compare base">` +
          `<div class="author">${esc(c.author)}</div>` +
          `<div class="date">on ${esc(dateStr)}</div>` +
          (c.oldPath ? `<div class="rename-dot" aria-label="renamed">R</div>` : '') +
        `</div>`
      );
    }
    stripEl.innerHTML = html.join('');
    stripEl.querySelectorAll('.node').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const sha = el.getAttribute('data-sha');
        if (ev.altKey || ev.metaKey) {
          toggleCompareBase(sha);
        } else {
          select(sha);
        }
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          select(el.getAttribute('data-sha'));
        }
      });
    });
    centerActive();
  }

  function toggleCompareBase(sha) {
    if (!sha) return;
    compareBaseSha = compareBaseSha === sha ? null : sha;
    updateComparePill();
    renderStrip();
    if (activeSha) select(activeSha);
  }

  function updateComparePill() {
    if (!compareBaseSha) { comparePill.hidden = true; return; }
    const c = state?.commits.find((x) => x.sha === compareBaseSha);
    compareBaseShaEl.textContent = c ? c.shortSha : compareBaseSha.slice(0, 7);
    comparePill.hidden = false;
  }

  function centerActive() {
    const a = stripEl.querySelector('.node.active');
    if (!a || !stripWrap) return;
    const ar = a.getBoundingClientRect();
    const wr = stripWrap.getBoundingClientRect();
    const wrapScrollLeft = stripWrap.scrollLeft;
    const targetLeft = ar.left - wr.left + wrapScrollLeft - (wr.width - ar.width) / 2;
    stripWrap.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }

  function positionCallout() {
    const a = stripEl.querySelector('.node.active');
    if (!a) return;
    const ar = a.getBoundingClientRect();
    const wr = stripWrap.getBoundingClientRect();
    const activeCenter = ar.left + ar.width / 2;
    const wrapCenter = wr.left + wr.width / 2;
    const offset = Math.round(activeCenter - wrapCenter);
    document.documentElement.style.setProperty('--callout-offset', `${offset}px`);
  }

  function renderCallout(stats, baseSha) {
    if (!state || !activeSha) return;
    const c = state.commits.find((x) => x.sha === activeSha);
    if (!c) return;
    const dt = new Date(c.date);
    const fullDate = dt.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const time = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const baseCommit = baseSha ? state.commits.find((x) => x.sha === baseSha) : null;
    const compareLine = baseCommit
      ? `<div class="meta" style="opacity:0.85"><span class="sep">comparing against base</span> <span class="sha">${esc(baseCommit.shortSha)}</span> <span>${esc(baseCommit.subject)}</span></div>`
      : '';
    const renameLine = c.oldPath
      ? `<div class="meta rename"><span class="rename-badge">renamed</span> <span class="rename-old">${esc(c.oldPath)}</span> <span class="sep">→</span> <span class="rename-new">${esc(c.path || state.relPath)}</span></div>`
      : '';
    if (c.ccType) calloutEl.setAttribute('data-cc', c.ccType);
    else calloutEl.removeAttribute('data-cc');
    const ccLabel = c.ccType
      ? `<span class="cc-badge">${esc(c.ccType)}${c.ccScope ? `(${esc(c.ccScope)})` : ''}${c.ccBreaking ? '!' : ''}</span> `
      : '';
    calloutEl.innerHTML =
      `<div class="subject">${ccLabel}${esc(stripCcPrefix(c.subject))}</div>` +
      `<div class="meta">` +
        `<span class="sha" title="${esc(c.sha)}">${esc(c.shortSha)}</span>` +
        `<span>${esc(c.author)}</span>` +
        `<span class="sep">·</span>` +
        `<span title="${esc(c.email)}">${esc(c.email)}</span>` +
        `<span class="sep">·</span>` +
        `<span>${esc(fullDate)} ${esc(time)}</span>` +
        `<span class="sep">·</span>` +
        `<span>${esc(c.relativeDate)}</span>` +
      `</div>` +
      compareLine +
      renameLine +
      (stats
        ? `<div class="stats"><span class="add">+${stats.add}</span><span class="del">−${stats.del}</span></div>`
        : '');
  }

  function renderDiff(lines, isInitial) {
    if (!lines || lines.length === 0) {
      diffEl.innerHTML = `<div id="empty-diff">No changes — file identical to parent.</div>`;
      return;
    }
    const rows = [];
    for (const l of lines) {
      const sign = isInitial ? ' ' : (l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' ');
      const num = l.num == null ? '' : l.num;
      const cls = isInitial ? 'ctx' : l.type;
      rows.push(
        `<div class="line-row ${cls}">` +
          `<div class="ln">${num}</div>` +
          `<div class="sign">${sign}</div>` +
          `<div class="src">${l.html || '&nbsp;'}</div>` +
        `</div>`
      );
    }
    diffEl.innerHTML = rows.join('');
    diffEl.scrollTop = 0;
  }

  function renderBanner(isInitial, baseSha) {
    if (!bannerEl) return;
    if (baseSha) {
      bannerEl.hidden = false;
      const base = state?.commits.find((x) => x.sha === baseSha);
      bannerEl.textContent = `Comparing against base commit ${base ? base.shortSha + ' — ' + base.subject : baseSha.slice(0,7)}`;
    } else if (isInitial) {
      bannerEl.hidden = false;
      bannerEl.textContent = 'Initial commit — file introduced here. Nothing to diff against.';
    } else {
      bannerEl.hidden = true;
      bannerEl.textContent = '';
    }
  }

  function select(sha) {
    if (!sha) return;
    const msg = { type: 'selectCommit', sha };
    if (compareBaseSha && compareBaseSha !== sha) msg.base = compareBaseSha;
    vscode.postMessage(msg);
  }

  function friendlyDate(d) {
    return d.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    }).replace(/,/g, '');
  }

  function stripCcPrefix(s) {
    return s.replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s*/i, '');
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  document.addEventListener('keydown', (e) => {
    if (!state || !activeSha) return;
    if (e.target === searchEl) {
      if (e.key === 'Escape') {
        searchEl.value = '';
        filterQuery = '';
        renderStrip();
        searchEl.blur();
      }
      return;
    }
    const idx = state.commits.findIndex((c) => c.sha === activeSha);
    if (idx < 0) return;
    if (e.key === 'k' || e.key === 'ArrowRight') {
      e.preventDefault();
      const newer = state.commits[Math.max(0, idx - 1)];
      if (newer) select(newer.sha);
    } else if (e.key === 'j' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const older = state.commits[Math.min(state.commits.length - 1, idx + 1)];
      if (older) select(older.sha);
    } else if (e.key === 'n') {
      e.preventDefault();
      jumpToChange(1);
    } else if (e.key === 'p') {
      e.preventDefault();
      jumpToChange(-1);
    } else if (e.key === '/') {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
    }
  });

  function jumpToChange(direction) {
    const rows = Array.from(diffEl.querySelectorAll('.line-row.add, .line-row.del'));
    if (rows.length === 0) return;
    const scrollTop = diffEl.scrollTop;
    const viewTop = scrollTop + 4;
    const viewBot = scrollTop + diffEl.clientHeight - 4;
    let target = null;
    if (direction > 0) {
      for (const r of rows) {
        if (r.offsetTop > viewBot - 1 || r.offsetTop > viewTop) {
          if (r.offsetTop > viewTop) { target = r; break; }
        }
      }
      if (!target) target = rows[0];
    } else {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].offsetTop < viewTop) { target = rows[i]; break; }
      }
      if (!target) target = rows[rows.length - 1];
    }
    if (!target) return;
    const targetTop = target.offsetTop - diffEl.clientHeight / 3;
    diffEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
  }

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      filterQuery = searchEl.value;
      renderStrip();
    });
  }

  if (pickaxeBtn) {
    pickaxeBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'pickaxe' });
    });
  }

  if (pickaxeClearBtn) {
    pickaxeClearBtn.addEventListener('click', () => {
      pickaxeShaSet = null;
      pickaxeTerm = '';
      pickaxePill.hidden = true;
      renderStrip();
    });
  }

  if (compareClearBtn) {
    compareClearBtn.addEventListener('click', () => {
      compareBaseSha = null;
      updateComparePill();
      renderStrip();
      if (activeSha) select(activeSha);
    });
  }

  window.addEventListener('resize', () => {
    centerActive();
    positionCallout();
  });

  vscode.postMessage({ type: 'ready' });
})();
