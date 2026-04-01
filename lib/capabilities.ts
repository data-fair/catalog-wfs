import type { Capability } from '@data-fair/types-catalogs'

export const capabilities = [
  'thumbnail',
  'search',
  'pagination',
  'import',
] satisfies Capability[]

export type WFSCapabilities = typeof capabilities
export default capabilities
