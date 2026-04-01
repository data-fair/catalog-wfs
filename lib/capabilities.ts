import type { Capability } from '@data-fair/types-catalogs'

export const capabilities = [
  'search',
  'pagination',
  'import',
] satisfies Capability[]

export type WFSCapabilities = typeof capabilities
export default capabilities
