/** Hub deploy: VITEPRESS_BASE=/worklist-client/ (see cast_api/azure-webapp.md). */
function normalizeVitepressBase(raw: string | undefined): string {
  const base = (raw ?? '/').trim() || '/';
  if (base === '/') {
    return '/';
  }
  return base.endsWith('/') ? base : `${base}/`;
}

export const BASE_URL: string = normalizeVitepressBase(process.env.VITEPRESS_BASE)

export const withBase = (path: string): string =>
  `${BASE_URL}${path.startsWith('/') ? path.slice(1) : path}`.replace(/\/+/g, '/')

export const isProd: boolean = process.env.NODE_ENV === 'production'

export const isDev: boolean = !isProd
