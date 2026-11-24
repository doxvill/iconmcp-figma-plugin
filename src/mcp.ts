const MCP_ENDPOINT = 'https://iconmcp.com/mcp';

export type IconStyle = 'outline' | 'duotone';

export interface IconRenderOptions {
  style: IconStyle;
  size: number;
  stroke: number;
  radius: number;
  color: string;
}

export interface IconCategory {
  id: string;
  label: string;
  count: number;
}

export interface IconSetInfo {
  id: string;
  label: string;
  group: string;
  description: string;
  count: number;
  categories: IconCategory[];
}

export interface ListSetsResponse {
  product: string;
  icons: number;
  sets: IconSetInfo[];
}

export interface IconItem {
  name: string;
  label: string;
  svg?: string;
  set?: string;
  category?: string;
  tags?: string[];
}

export interface GetSetResponse {
  id: string;
  label: string;
  description: string;
  total: number;
  offset: number;
  returned: number;
  next: number | null;
  icons: IconItem[];
}

export interface SearchIconsResponse {
  query: string;
  weak: boolean;
  results: Array<{
    name: string;
    label: string;
    set: string;
    category: string;
    tags: string[];
    score: number;
  }>;
}

let rpcId = 1;
const svgCache = new Map<string, string>();
let cachedSets: ListSetsResponse | null = null;

async function callMcpTool<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const payload = await res.json();
  if (payload.error) {
    throw new Error(payload.error.message || 'MCP error');
  }

  const text = payload?.result?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected MCP response format');
  }

  return text as T;
}

export function normalizeSvgColor(svg: string, color: string): string {
  return svg.replace(/currentColor/g, color);
}

function cacheKey(name: string, opts: IconRenderOptions): string {
  return `${name}|${opts.style}|${opts.size}|${opts.stroke}|${opts.radius}|${opts.color}`;
}

export async function listSets(signal?: AbortSignal): Promise<ListSetsResponse> {
  if (cachedSets) return cachedSets;
  const raw = await callMcpTool<string>('list_sets', {}, signal);
  cachedSets = JSON.parse(raw) as ListSetsResponse;
  return cachedSets;
}

export async function getSetIcons(
  params: {
    id: string;
    category?: string;
    offset?: number;
    limit?: number;
    options: IconRenderOptions;
  },
  signal?: AbortSignal,
): Promise<GetSetResponse> {
  const args: Record<string, unknown> = {
    id: params.id,
    format: 'svg',
    offset: params.offset ?? 0,
    limit: params.limit ?? 60,
    style: params.options.style,
    size: params.options.size,
    stroke: params.options.stroke,
    radius: params.options.radius,
    color: params.options.color,
  };
  if (params.category) {
    args.category = params.category;
  }

  const raw = await callMcpTool<string>('get_set', args, signal);
  const data = JSON.parse(raw) as GetSetResponse;

  for (const icon of data.icons) {
    if (icon.svg) {
      svgCache.set(cacheKey(icon.name, params.options), icon.svg);
    }
  }

  return data;
}

export async function searchIcons(
  query: string,
  setId?: string,
  limit = 48,
  signal?: AbortSignal,
): Promise<SearchIconsResponse> {
  const args: Record<string, unknown> = { query, limit };
  if (setId) {
    args.set = setId;
  }
  const raw = await callMcpTool<string>('search_icons', args, signal);
  return JSON.parse(raw) as SearchIconsResponse;
}

export async function getIconSvg(
  name: string,
  options: IconRenderOptions,
  signal?: AbortSignal,
): Promise<string> {
  const key = cacheKey(name, options);
  const cached = svgCache.get(key);
  if (cached) return cached;

  const svg = await callMcpTool<string>(
    'get_icon',
    {
      name,
      format: 'svg',
      style: options.style,
      size: options.size,
      stroke: options.stroke,
      radius: options.radius,
      color: options.color,
    },
    signal,
  );

  svgCache.set(key, svg);
  return svg;
}

export function getCachedIconSvg(name: string, options: IconRenderOptions): string | undefined {
  return svgCache.get(cacheKey(name, options));
}
