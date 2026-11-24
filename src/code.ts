/// <reference types="@figma/plugin-typings" />

const SETTINGS_KEY = 'iconmcp:settings';
const RECENT_KEY = 'iconmcp:recent';
const MAX_RECENT = 24;

interface SavedSettings {
  style: 'outline' | 'duotone';
  size: number;
  stroke: number;
  radius: number;
  color: string;
  selectedSetId: string;
  asComponent: boolean;
  replaceSelected: boolean;
  width: number;
  height: number;
}

interface RecentIcon {
  name: string;
  label: string;
}

interface InsertIconMessage {
  type: 'insert-icon';
  name: string;
  label?: string;
  svg: string;
  size: number;
  asComponent?: boolean;
  replaceSelected?: boolean;
}

interface NotifyMessage {
  type: 'notify';
  message: string;
  error?: boolean;
}

interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

interface SaveSettingsMessage {
  type: 'save-settings';
  settings: Partial<SavedSettings>;
}

interface ClearRecentMessage {
  type: 'clear-recent';
}

type PluginMessage =
  | InsertIconMessage
  | NotifyMessage
  | ResizeMessage
  | SaveSettingsMessage
  | ClearRecentMessage;

figma.showUI(__html__, {
  width: 360,
  height: 560,
  themeColors: true,
});

function isContainerNode(node: SceneNode): node is FrameNode | GroupNode | SectionNode {
  return node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'SECTION';
}

function setScaleConstraints(root: BaseNode): void {
  if (!('children' in root)) return;
  for (const child of root.children) {
    if ('constraints' in child) {
      child.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
    }
    setScaleConstraints(child);
  }
}

function createIconNode(opts: {
  name: string;
  svg: string;
  size: number;
  asComponent?: boolean;
}): FrameNode | ComponentNode {
  let node: FrameNode | ComponentNode = figma.createNodeFromSvg(opts.svg);
  setScaleConstraints(node);

  if (opts.size > 0 && (node.width !== opts.size || node.height !== opts.size)) {
    node.resize(opts.size, opts.size);
  }

  if (opts.asComponent) {
    node = figma.createComponentFromNode(node);
  }

  node.name = opts.name;
  return node;
}

async function recordRecent(item: RecentIcon): Promise<void> {
  try {
    const existing = ((await figma.clientStorage.getAsync(RECENT_KEY)) as RecentIcon[] | undefined) ?? [];
    const next = [item, ...existing.filter((r) => r.name !== item.name)].slice(0, MAX_RECENT);
    await figma.clientStorage.setAsync(RECENT_KEY, next);
    figma.ui.postMessage({ type: 'recent-updated', recent: next });
  } catch {
    // Ignore storage errors
  }
}

async function bootstrap(): Promise<void> {
  try {
    const [settings, recent] = await Promise.all([
      figma.clientStorage.getAsync(SETTINGS_KEY) as Promise<Partial<SavedSettings> | undefined>,
      figma.clientStorage.getAsync(RECENT_KEY) as Promise<RecentIcon[] | undefined>,
    ]);

    if (settings?.width && settings?.height) {
      const w = Math.max(300, Math.min(800, Math.round(settings.width)));
      const h = Math.max(400, Math.min(900, Math.round(settings.height)));
      figma.ui.resize(w, h);
    }

    figma.ui.postMessage({
      type: 'init-state',
      settings: settings ?? {},
      recent: recent ?? [],
    });
  } catch {
    figma.ui.postMessage({ type: 'init-state', settings: {}, recent: [] });
  }
}

void bootstrap();

figma.on('drop', (event: DropEvent) => {
  const svgItem = event.items.find((item) => item.type === 'image/svg+xml');
  if (!svgItem?.data) return true;

  const meta = (event.dropMetadata ?? {}) as {
    name?: string;
    label?: string;
    size?: number;
    asComponent?: boolean;
  };
  const name = meta.name || 'icon';
  const size = meta.size || 24;

  try {
    const node = createIconNode({
      name,
      svg: svgItem.data,
      size,
      asComponent: Boolean(meta.asComponent),
    });

    if (event.node && 'appendChild' in event.node && event.node.type !== 'DOCUMENT') {
      event.node.appendChild(node);
      node.x = Math.round(event.x - node.width / 2);
      node.y = Math.round(event.y - node.height / 2);
    } else {
      node.x = Math.round(event.absoluteX - node.width / 2);
      node.y = Math.round(event.absoluteY - node.height / 2);
    }

    figma.currentPage.selection = [node];
    figma.notify(`Dropped "${name}"${meta.asComponent ? ' (Component)' : ''}`);
    void recordRecent({ name, label: meta.label || name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    figma.notify(`Failed to drop "${name}": ${message}`, { error: true });
  }

  return false;
});

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'insert-icon') {
    try {
      const node = createIconNode({
        name: msg.name,
        svg: msg.svg,
        size: msg.size,
        asComponent: msg.asComponent,
      });

      const selection = figma.currentPage.selection;
      const single = selection.length === 1 ? selection[0] : null;

      if (msg.replaceSelected && single && single.parent && 'insertChild' in single.parent) {
        const parent = single.parent;
        const index = parent.children.indexOf(single);
        const { x, y, width, height } = single;
        if (width > 0 && height > 0) {
          node.resize(width, height);
        }
        parent.insertChild(index, node);
        node.x = x;
        node.y = y;
        single.remove();
        figma.currentPage.selection = [node];
        figma.notify(`Replaced with "${msg.name}"`);
      } else if (single && isContainerNode(single)) {
        single.appendChild(node);
        node.x = Math.round((single.width - node.width) / 2);
        node.y = Math.round((single.height - node.height) / 2);
        figma.currentPage.selection = [node];
        figma.notify(`Inserted "${msg.name}"${msg.asComponent ? ' (Component)' : ''}`);
      } else {
        const center = figma.viewport.center;
        node.x = Math.round(center.x - node.width / 2);
        node.y = Math.round(center.y - node.height / 2);
        figma.currentPage.selection = [node];
        figma.notify(`Inserted "${msg.name}"${msg.asComponent ? ' (Component)' : ''}`);
      }

      void recordRecent({ name: msg.name, label: msg.label || msg.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      figma.notify(`Failed to insert "${msg.name}": ${message}`, { error: true });
    }
  } else if (msg.type === 'notify') {
    figma.notify(msg.message, { error: Boolean(msg.error) });
  } else if (msg.type === 'resize') {
    const w = Math.max(300, Math.min(800, Math.round(msg.width)));
    const h = Math.max(400, Math.min(900, Math.round(msg.height)));
    figma.ui.resize(w, h);
  } else if (msg.type === 'save-settings') {
    try {
      const prev = ((await figma.clientStorage.getAsync(SETTINGS_KEY)) as Partial<SavedSettings> | undefined) ?? {};
      await figma.clientStorage.setAsync(SETTINGS_KEY, { ...prev, ...msg.settings });
    } catch {
      // Ignore storage errors
    }
  } else if (msg.type === 'clear-recent') {
    try {
      await figma.clientStorage.setAsync(RECENT_KEY, []);
      figma.ui.postMessage({ type: 'recent-updated', recent: [] });
      figma.notify('Cleared recent icons');
    } catch {
      // Ignore storage errors
    }
  }
};
