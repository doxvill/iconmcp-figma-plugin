import './styles.css';
import {
  getCachedIconSvg,
  getIconSvg,
  getSetIcons,
  listSets,
  normalizeSvgColor,
  searchIcons,
  type IconItem,
  type IconRenderOptions,
  type IconSetInfo,
  type IconStyle,
} from './mcp';

const DEFAULT_HINT = 'Click to insert \u00b7 Right-click to copy';
const PAGE_SIZE = 60;
const SEARCH_LIMIT = 48;
const SVG_FETCH_CONCURRENCY = 8;

const state = {
  sets: [] as IconSetInfo[],
  selectedSetId: 'generic',
  selectedCategory: '',
  query: '',
  items: [] as IconItem[],
  nextOffset: null as number | null,
  totalInView: 0,
  isLoading: false,
  options: {
    style: 'outline' as IconStyle,
    size: 24,
    stroke: 1.25,
    radius: 2,
    color: '#111111',
  } satisfies IconRenderOptions,
};

let activeAbort: AbortController | null = null;
let searchDebounce: number | undefined;
let optionsDebounce: number | undefined;

// DOM elements
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const clearSearchBtn = document.getElementById('clear-search') as HTMLButtonElement;
const setSelect = document.getElementById('set-select') as HTMLSelectElement;
const categoryBar = document.getElementById('category-bar') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const hoverName = document.getElementById('hover-name') as HTMLSpanElement;
const iconGrid = document.getElementById('icon-grid') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const emptyTitle = document.getElementById('empty-title') as HTMLParagraphElement;
const emptySubtitle = document.getElementById('empty-subtitle') as HTMLParagraphElement;
const loadMoreWrap = document.getElementById('load-more-wrap') as HTMLDivElement;
const loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
const sizeSelect = document.getElementById('size-select') as HTMLSelectElement;
const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
const colorHex = document.getElementById('color-hex') as HTMLInputElement;
const strokeRange = document.getElementById('stroke-range') as HTMLInputElement;
const strokeVal = document.getElementById('stroke-val') as HTMLElement;
const radiusRange = document.getElementById('radius-range') as HTMLInputElement;
const radiusVal = document.getElementById('radius-val') as HTMLElement;
const styleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.seg-btn'));
const resizeHandle = document.getElementById('resize-handle') as HTMLDivElement;

function postToPlugin(msg: unknown): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function abortActive(): AbortController {
  if (activeAbort) {
    activeAbort.abort();
  }
  activeAbort = new AbortController();
  return activeAbort;
}

function setStatus(text: string): void {
  statusText.textContent = text;
}

function showEmpty(title: string, subtitle: string): void {
  emptyTitle.textContent = title;
  emptySubtitle.textContent = subtitle;
  emptyState.hidden = false;
}

function hideEmpty(): void {
  emptyState.hidden = true;
}

function populateSetsDropdown(sets: IconSetInfo[]): void {
  setSelect.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All sets';
  setSelect.appendChild(allOpt);

  const groups = new Map<string, IconSetInfo[]>();
  for (const s of sets) {
    const group = s.group || 'Other';
    const list = groups.get(group) ?? [];
    list.push(s);
    groups.set(group, list);
  }

  for (const [groupName, groupSets] of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupName;
    for (const s of groupSets) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.label} (${s.count})`;
      optgroup.appendChild(opt);
    }
    setSelect.appendChild(optgroup);
  }

  if (sets.some((s) => s.id === state.selectedSetId)) {
    setSelect.value = state.selectedSetId;
  } else if (sets.length > 0) {
    state.selectedSetId = sets[0].id;
    setSelect.value = sets[0].id;
  }
}

function renderCategories(): void {
  const currentSet = state.sets.find((s) => s.id === state.selectedSetId);
  if (!currentSet || state.query.trim().length > 0 || currentSet.categories.length === 0) {
    categoryBar.hidden = true;
    categoryBar.innerHTML = '';
    return;
  }

  categoryBar.hidden = false;
  categoryBar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `cat-pill${state.selectedCategory === '' ? ' active' : ''}`;
  allBtn.textContent = `All (${currentSet.count})`;
  allBtn.addEventListener('click', () => {
    if (state.selectedCategory === '') return;
    state.selectedCategory = '';
    renderCategories();
    void loadCurrentView();
  });
  categoryBar.appendChild(allBtn);

  for (const cat of currentSet.categories) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-pill${state.selectedCategory === cat.id ? ' active' : ''}`;
    btn.textContent = `${cat.label} (${cat.count})`;
    btn.addEventListener('click', () => {
      if (state.selectedCategory === cat.id) return;
      state.selectedCategory = cat.id;
      renderCategories();
      void loadCurrentView();
    });
    categoryBar.appendChild(btn);
  }
}

function applySvgToTile(tile: HTMLButtonElement, rawSvg: string): void {
  tile.classList.remove('skeleton');
  tile.innerHTML = normalizeSvgColor(rawSvg, state.options.color);
}

async function copySvgToClipboard(name: string, svg: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(svg);
    postToPlugin({ type: 'notify', message: `Copied "${name}" SVG` });
  } catch {
    const ta = document.createElement('textarea');
    ta.value = svg;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    postToPlugin({
      type: 'notify',
      message: ok ? `Copied "${name}" SVG` : 'Could not copy SVG',
      error: !ok,
    });
  }
}

function createIconTile(item: IconItem): HTMLButtonElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'icon-tile';
  tile.title = item.label ? `${item.label} (${item.name})` : item.name;
  tile.dataset.name = item.name;

  const svg = item.svg ?? getCachedIconSvg(item.name, state.options);
  if (svg) {
    applySvgToTile(tile, svg);
  } else {
    tile.classList.add('skeleton');
  }

  tile.addEventListener('mouseenter', () => {
    hoverName.textContent = item.name;
  });

  tile.addEventListener('mouseleave', () => {
    hoverName.textContent = DEFAULT_HINT;
  });

  tile.addEventListener('click', async () => {
    try {
      const rawSvg =
        getCachedIconSvg(item.name, state.options) ??
        (await getIconSvg(item.name, state.options));
      const finalSvg = normalizeSvgColor(rawSvg, state.options.color);
      postToPlugin({
        type: 'insert-icon',
        name: item.name,
        svg: finalSvg,
        size: state.options.size,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postToPlugin({ type: 'notify', message: `Error: ${message}`, error: true });
    }
  });

  tile.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    try {
      const rawSvg =
        getCachedIconSvg(item.name, state.options) ??
        (await getIconSvg(item.name, state.options));
      const finalSvg = normalizeSvgColor(rawSvg, state.options.color);
      await copySvgToClipboard(item.name, finalSvg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postToPlugin({ type: 'notify', message: `Error: ${message}`, error: true });
    }
  });

  return tile;
}

function renderGrid(items: IconItem[], append = false): HTMLButtonElement[] {
  if (!append) {
    iconGrid.innerHTML = '';
  }
  const created: HTMLButtonElement[] = [];
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const tile = createIconTile(item);
    created.push(tile);
    frag.appendChild(tile);
  }
  iconGrid.appendChild(frag);
  return created;
}

async function hydrateSearchSvgs(
  items: IconItem[],
  tiles: HTMLButtonElement[],
  signal: AbortSignal,
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length && !signal.aborted) {
      const i = index++;
      const item = items[i];
      const tile = tiles[i];
      if (!item || !tile) continue;
      if (getCachedIconSvg(item.name, state.options)) continue;

      try {
        const svg = await getIconSvg(item.name, state.options, signal);
        if (!signal.aborted) {
          applySvgToTile(tile, svg);
        }
      } catch {
        // Ignore aborted or individual failed icon preview
      }
    }
  }

  const workers = Array.from({ length: Math.min(SVG_FETCH_CONCURRENCY, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
}

async function loadCurrentView(append = false): Promise<void> {
  const controller = abortActive();
  const signal = controller.signal;
  const query = state.query.trim();

  state.isLoading = true;
  loadMoreBtn.disabled = true;

  try {
    if (query.length > 0) {
      loadMoreWrap.hidden = true;
      hideEmpty();
      setStatus('Searching...');
      const res = await searchIcons(
        query,
        state.selectedSetId || undefined,
        SEARCH_LIMIT,
        signal,
      );
      if (signal.aborted) return;

      state.items = res.results.map((r) => ({
        name: r.name,
        label: r.label,
        set: r.set,
        category: r.category,
        tags: r.tags,
      }));
      state.nextOffset = null;

      if (state.items.length === 0) {
        iconGrid.innerHTML = '';
        showEmpty('No icons found', 'Try different keywords or switch to "All sets".');
        setStatus('0 results');
        return;
      }

      const tiles = renderGrid(state.items, false);
      setStatus(
        `${state.items.length} result${state.items.length === 1 ? '' : 's'}${res.weak ? ' (broad match)' : ''}`,
      );
      void hydrateSearchSvgs(state.items, tiles, signal);
      return;
    }

    // Browse mode: requires a set id
    const setId = state.selectedSetId || state.sets[0]?.id || 'generic';
    if (!state.selectedSetId && setId) {
      state.selectedSetId = setId;
      setSelect.value = setId;
      renderCategories();
    }

    const offset = append && state.nextOffset !== null ? state.nextOffset : 0;
    if (!append) {
      hideEmpty();
      setStatus('Loading icons...');
    }

    const res = await getSetIcons(
      {
        id: setId,
        category: state.selectedCategory || undefined,
        offset,
        limit: PAGE_SIZE,
        options: state.options,
      },
      signal,
    );
    if (signal.aborted) return;

    state.items = append ? [...state.items, ...res.icons] : res.icons;
    state.nextOffset = res.next;
    state.totalInView = res.total;

    if (state.items.length === 0) {
      iconGrid.innerHTML = '';
      showEmpty('No icons in this category', 'Pick another category or set.');
      loadMoreWrap.hidden = true;
      setStatus('0 icons');
      return;
    }

    renderGrid(res.icons, append);
    loadMoreWrap.hidden = res.next === null;
    setStatus(`${state.items.length} of ${res.total} icons`);
  } catch (err) {
    if (signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    setStatus('Connection error');
    if (!append) {
      iconGrid.innerHTML = '';
      showEmpty('Could not reach IconMCP', message);
    }
  } finally {
    if (!signal.aborted) {
      state.isLoading = false;
      loadMoreBtn.disabled = false;
    }
  }
}

function scheduleOptionsReload(): void {
  window.clearTimeout(optionsDebounce);
  optionsDebounce = window.setTimeout(() => {
    void loadCurrentView(false);
  }, 220);
}

function bindEvents(): void {
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    clearSearchBtn.hidden = state.query.length === 0;
    renderCategories();

    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      void loadCurrentView(false);
    }, 240);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearSearchBtn.hidden = true;
    renderCategories();
    void loadCurrentView(false);
    searchInput.focus();
  });

  setSelect.addEventListener('change', () => {
    state.selectedSetId = setSelect.value;
    state.selectedCategory = '';
    renderCategories();
    void loadCurrentView(false);
  });

  loadMoreBtn.addEventListener('click', () => {
    if (!state.isLoading && state.nextOffset !== null) {
      void loadCurrentView(true);
    }
  });

  for (const btn of styleButtons) {
    btn.addEventListener('click', () => {
      const nextStyle = btn.dataset.style as IconStyle;
      if (state.options.style === nextStyle) return;
      state.options.style = nextStyle;
      for (const b of styleButtons) {
        b.classList.toggle('active', b === btn);
      }
      scheduleOptionsReload();
    });
  }

  sizeSelect.addEventListener('change', () => {
    state.options.size = Number(sizeSelect.value) || 24;
    scheduleOptionsReload();
  });

  colorPicker.addEventListener('input', () => {
    state.options.color = colorPicker.value;
    colorHex.value = colorPicker.value;
    scheduleOptionsReload();
  });

  colorHex.addEventListener('input', () => {
    const val = colorHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      state.options.color = val;
      colorPicker.value = val;
      scheduleOptionsReload();
    }
  });

  strokeRange.addEventListener('input', () => {
    const val = Number(strokeRange.value);
    state.options.stroke = val;
    strokeVal.textContent = String(val);
    scheduleOptionsReload();
  });

  radiusRange.addEventListener('input', () => {
    const val = Number(radiusRange.value);
    state.options.radius = val;
    radiusVal.textContent = String(val);
    scheduleOptionsReload();
  });

  // "/" shortcut focuses search
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== colorHex) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // Drag resize handle
  resizeHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizeHandle.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      postToPlugin({ type: 'resize', width: ev.clientX + 8, height: ev.clientY + 8 });
    };
    const onUp = () => {
      resizeHandle.removeEventListener('pointermove', onMove);
      resizeHandle.removeEventListener('pointerup', onUp);
    };
    resizeHandle.addEventListener('pointermove', onMove);
    resizeHandle.addEventListener('pointerup', onUp);
  });
}

async function init(): Promise<void> {
  bindEvents();
  try {
    const data = await listSets();
    state.sets = data.sets;
    populateSetsDropdown(data.sets);
    renderCategories();
    searchInput.placeholder = `Search ${data.icons.toLocaleString('en-US')} icons...`;
    await loadCurrentView(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus('Failed to load sets');
    showEmpty('Could not connect to IconMCP', message);
  }
}

void init();
