import type CatalogPlugin from '@data-fair/types-catalogs'
import { strict as assert } from 'node:assert'
import { it, describe, beforeEach } from 'node:test'
import fs from 'fs-extra'
import { logFunctions } from './test-utils.ts'

import plugin from '../index.ts'
const catalogPlugin: CatalogPlugin = plugin as CatalogPlugin

const catalogConfig = {
  url: 'https://geobretagne.fr/geoserver/ows',
  version: '2.0.0'
}

const secrets = {}
const tmpDir = './data/test/downloads'

const getResourceParams = {
  catalogConfig,
  secrets,
  resourceId: 'sdis29:accident_circulation_sdis29',
  importConfig: {},
  update: { metadata: true, schema: true },
  tmpDir,
  log: logFunctions
}

describe('catalog-wfs', () => {
  describe('list', () => {
    it('should list FeatureTypes from WFS 2.0.0', async () => {
      const res = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: {}
      })

      assert.ok(res.count > 0, 'Should have FeatureTypes')
      assert.ok(res.results.length > 0)
      assert.equal(res.results[0].type, 'resource')
    })

    it('should list FeatureTypes with search query', async () => {
      const res = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: { q: 'accident' }
      })

      assert.ok(res.results.length > 0, 'Should have results')
    })

    it('should paginate FeatureTypes', async () => {
      const res = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: { page: 1, size: 5 }
      })

      assert.ok(res.count > 0)
      assert.ok(res.results.length <= 5)
    })
  })

  describe('getResource', () => {
    beforeEach(async () => {
      await fs.ensureDir(tmpDir)
      await fs.emptyDir(tmpDir)
    })

    it('should download FeatureType as GeoJSON', async () => {
      const resource = await catalogPlugin.getResource({
        ...getResourceParams,
        resourceId: 'sdis29:accident_circulation_sdis29'
      })

      assert.ok(resource, 'Resource should exist')
      assert.ok(resource.filePath)
      assert.ok(resource.filePath.endsWith('.geojson') || resource.filePath.endsWith('.json'))

      const fileExists = await fs.pathExists(resource.filePath)
      assert.ok(fileExists, 'Downloaded file should exist')
    })

    it('should download FeatureType as CSV', async () => {
      const resource = await catalogPlugin.getResource({
        ...getResourceParams,
        resourceId: 'sdis29:accident_circulation_sdis29',
        importConfig: { format: 'csv' }
      })

      assert.ok(resource, 'Resource should exist')
      assert.ok(resource.filePath)
      assert.ok(resource.filePath.endsWith('.csv'))
    })
  })
})
