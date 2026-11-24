/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, {
  width: 360,
  height: 560,
  themeColors: true,
});

interface InsertIconMessage {
  type: 'insert-icon';
  name: string;
  svg: string;
  size: number;
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

type PluginMessage = InsertIconMessage | NotifyMessage | ResizeMessage;

function isContainerNode(node: SceneNode): node is FrameNode | GroupNode | SectionNode {
  return node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'SECTION';
}

figma.ui.onmessage = (msg: PluginMessage) => {
  if (msg.type === 'insert-icon') {
    try {
      const node = figma.createNodeFromSvg(msg.svg);
      node.name = msg.name;

      if (msg.size > 0 && (node.width !== msg.size || node.height !== msg.size)) {
        node.resize(msg.size, msg.size);
      }

      const selection = figma.currentPage.selection;
      const target = selection.length === 1 && isContainerNode(selection[0]) ? selection[0] : null;

      if (target) {
        target.appendChild(node);
        node.x = Math.round((target.width - node.width) / 2);
        node.y = Math.round((target.height - node.height) / 2);
      } else {
        const center = figma.viewport.center;
        node.x = Math.round(center.x - node.width / 2);
        node.y = Math.round(center.y - node.height / 2);
      }

      figma.currentPage.selection = [node];
      figma.notify(`Inserted "${msg.name}"`);
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
  }
};
