import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'node:stream/promises'
import axios from '@data-fair/lib-node/axios.js'
import type { CatalogPlugin, GetResourceContext, Resource } from '@data-fair/types-catalogs'
import type { WFSConfig } from '#types'
import { convertGmlToGeoJson } from './utils/gml.ts'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: true
})

export const getResource = async ({ resourceId, tmpDir, log, catalogConfig }: GetResourceContext<WFSConfig>): ReturnType<CatalogPlugin['getResource']> => {
  const version = catalogConfig.version || '2.0.0'
  const featureTypeName = resourceId

  await log.step('Récupération des métadonnées du FeatureType')

  const capabilitiesUrl = new URL(catalogConfig.url)
  capabilitiesUrl.searchParams.set('service', 'WFS')
  capabilitiesUrl.searchParams.set('version', version)
  capabilitiesUrl.searchParams.set('request', 'GetCapabilities')

  let featureTitle = featureTypeName
  let featureAbstract = ''
  let origin: string | undefined
  let keywords: string[] | undefined

  try {
    const capsResponse = await axios.get(capabilitiesUrl.toString())
    const capsParsed = parser.parse(capsResponse.data)

    const ftList = capsParsed?.WFS_Capabilities?.FeatureTypeList?.FeatureType
    const ftArray = Array.isArray(ftList) ? ftList : [ftList]
    const ft = ftArray.find((f: any) => f.Name === featureTypeName || f.name === featureTypeName)

    if (ft) {
      featureTitle = ft.Title || ft.title || featureTypeName
      featureAbstract = ft.Abstract || ft.abstract || ''

      const metadataUrls = ft.MetadataURL || ft['ows:MetadataURL']
      if (metadataUrls) {
        const urls = Array.isArray(metadataUrls) ? metadataUrls : [metadataUrls]
        origin = urls[0]?.href
      }

      const keywordsNode = ft.Keywords || ft['ows:Keywords']
      if (keywordsNode) {
        const kwArray = Array.isArray(keywordsNode.Keyword)
          ? keywordsNode.Keyword
          : keywordsNode.Keyword ? [keywordsNode.Keyword] : []
        const filtered = kwArray.filter(Boolean) as string[]
        keywords = filtered.length > 0 ? filtered : undefined
      }
    }
  } catch (error) {
    await log.warning(`Impossible de récupérer les métadonnées pour ${featureTypeName}`)
  }

  await log.step('Récupération des données (GetFeature)')

  const getFeatureUrl = new URL(catalogConfig.url)
  getFeatureUrl.searchParams.set('service', 'WFS')
  getFeatureUrl.searchParams.set('version', version)
  getFeatureUrl.searchParams.set('request', 'GetFeature')

  if (version === '2.0.0') {
    getFeatureUrl.searchParams.set('typeNames', featureTypeName)
  } else {
    getFeatureUrl.searchParams.set('typeName', featureTypeName)
  }

  if (version === '2.0.0' || version === '1.1.0') {
    getFeatureUrl.searchParams.set('outputFormat', 'application/json')
  } else {
    getFeatureUrl.searchParams.set('outputFormat', 'GML2')
  }

  const fileExtension = 'geojson'
  const safeFileName = featureTypeName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()

  const destPath = path.join(tmpDir, `${safeFileName}.${fileExtension}`)

  try {
    if (version === '2.0.0' || version === '1.1.0') {
      const response = await axios.get(getFeatureUrl.toString(), {
        responseType: 'stream'
      })

      const writer = fs.createWriteStream(destPath)
      await pipeline(response.data, writer)
    } else {
      const response = await axios.get(getFeatureUrl.toString(), {
        responseType: 'text'
      })
      const convertedData = convertGmlToGeoJson(response.data)
      const fsPromises = await import('node:fs/promises')
      await fsPromises.writeFile(destPath, JSON.stringify(convertedData), 'utf8')
    }
  } catch (error: any) {
    throw new Error(`Erreur lors de la récupération des données: ${error.message}`)
  }

  await log.info(`Ressource ${featureTypeName} récupérée avec succès`)

  return {
    id: resourceId,
    title: featureTitle,
    description: featureAbstract,
    filePath: destPath,
    format: fileExtension,
    ...(origin && { origin }),
    ...(keywords && keywords.length > 0 && { keywords })
  } as Resource
}
