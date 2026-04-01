import type CatalogPlugin from '@data-fair/types-catalogs'
import { configSchema, assertConfigValid, type WFSConfig } from '#types'
import { type WFSCapabilities, capabilities } from './lib/capabilities.ts'

const plugin: CatalogPlugin<WFSConfig, WFSCapabilities> = {
  async prepare (context) {
    const prepare = (await import('./lib/prepare.ts')).default
    return prepare(context)
  },

  async list (context) {
    const { list } = await import('./lib/list.ts')
    return list(context)
  },

  async getResource (context) {
    const { getResource } = await import('./lib/imports.ts')
    return getResource(context)
  },

  metadata: {
    title: 'WFS',
    thumbnailPath: './lib/resources/wfs-logo.svg',
    description: 'Importez des données géographiques depuis un service WFS (Web Feature Service).',
    capabilities
  },

  configSchema,
  assertConfigValid
}
export default plugin
