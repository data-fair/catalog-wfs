import { XMLParser } from 'fast-xml-parser'
import fs from 'fs-extra'
import pick from 'stream-json/filters/pick.js'
import streamArray from 'stream-json/streamers/stream-array.js'
import chain from 'stream-chain'
import path from 'path'

import axios from '@data-fair/lib-node/axios.js'
import type { ResponseType } from 'axios'
import type { CatalogPlugin, GetResourceContext, Resource } from '@data-fair/types-catalogs'
import type { WFSConfig } from '#types'

import { convertGmlToGeoJson } from './utils/gml.ts'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: true
})

const DEFAULT_PAGE_SIZE = 5000

/**
 * Allows you to make an HTTP request to retrieve the content of a page from the file to be downloaded.
 *
 * The requests are performed 3 times (retries). Indeed, it is possible to have an error because the calls
 * are chained too quickly, hence the implementation of an increasingly long timeout (2s to 6s) and
 * additional calls.
 *
 * @param url       Destination URL (containing startIndex and count)
 * @param log       Log instance to display information
 * @param resType   Expected response type with axios ('stream' or 'text')
 * @param retries   Number of attempts before giving up and triggering an error
 * @returns   HTTP request response
 */
const fetchPage = async (url: string, log: any, resType: ResponseType | undefined, retries = 3) => {
  if (retries < 1) retries = 1
  for (let i = 1; i <= retries; i++) {
    try {
      return await axios.get(url, { responseType: resType, timeout: 0 })
    } catch (error: any) {
      if (i === retries) throw error
      await log.warning(`Retry ${i}/${retries}: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 2000 * i))
    }
  }
}

/**
 * Allows you to retrieve the stream of a page and import the data into a single file
 *
 * @param response    HTTP request response corresponding to the page
 * @param onFeature   Function to execute to add the data to the file
 * @returns   Number of results added
 */
const streamPage = async (response: any, onFeature: (feature: any) => void): Promise<number> => {
  let pageResults = 0
  // `pick` is used to filter the array of features; we don't want the files one after the other, but simply to build a single one.
  const pipelineResult = chain([response.data, pick.withParser({ filter: 'features' }), streamArray()])

  await new Promise<void>((resolve, reject) => {
    pipelineResult.on('data', (data) => {
      onFeature(data.value)
      pageResults++
    })
    pipelineResult.on('end', resolve)
    pipelineResult.on('error', reject)
  })

  await new Promise<void>((resolve, reject) => {
    if (response.data.destroyed) return resolve()
    response.data.resume()
    response.data.once('close', resolve)
    response.data.once('end', resolve)
    response.data.once('error', reject)
  })

  pipelineResult.destroy()
  return pageResults
}

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

  // Get the number of results
  const getNbResultsUrl = new URL(catalogConfig.url)
  getNbResultsUrl.searchParams.set('service', 'WFS')
  getNbResultsUrl.searchParams.set('version', version)
  getNbResultsUrl.searchParams.set('request', 'GetFeature')
  getNbResultsUrl.searchParams.set('resultType', 'hits')

  if (version === '2.0.0') {
    getNbResultsUrl.searchParams.set('typeNames', featureTypeName)
  } else {
    getNbResultsUrl.searchParams.set('typeName', featureTypeName)
  }

  let nbTotalResults: number | 'unknown' = 0
  try {
    const response = await axios.get(getNbResultsUrl.toString())
    const parseResponse = parser.parse(response.data)
    nbTotalResults = parseResponse.FeatureCollection.numberMatched === 'unknown'
      ? 'unknown'
      : parseResponse.FeatureCollection.numberMatched ?? 0
  } catch (error: any) {
    throw new Error(`Erreur lors de la récupération du nombre total de résultat: ${error.message}`)
  }

  if (nbTotalResults !== 'unknown' && nbTotalResults <= 0) {
    await log.error('Le fichier source ne contient aucune donnée.')
    throw new Error(`Pas de données dans le fichier à télécharger (nbTotalResults = ${nbTotalResults})`)
  }

  if (nbTotalResults !== 'unknown') {
    await log.info(`${nbTotalResults} résultats attendus`)
  } else {
    await log.warning('On ne peut pas estimer le nombre de résultats attendus. On estime que toutes les données seront envoyées en un seul stream.')
  }

  await log.step('Récupération des données (GetFeature)')

  // Build the GetFeature URL
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
      // Fetch first page as JSON to extract envelope metadata (crs, etc.)
      getFeatureUrl.searchParams.set('startIndex', '0')
      getFeatureUrl.searchParams.set('count', '1')
      const firstPage = (await axios.get(getFeatureUrl.toString(), { responseType: 'json' })).data

      const writer = fs.createWriteStream(destPath)

      // Write envelope from first page
      writer.write('{"type":"FeatureCollection"')
      if (firstPage.crs) writer.write(`,"crs":${JSON.stringify(firstPage.crs)}`)
      writer.write(',"features":[')

      let isFirst = true
      let nbResults = 0

      // Write features from first page
      for (const feature of firstPage.features ?? []) {
        if (!isFirst) writer.write(',')
        writer.write(JSON.stringify(feature))
        isFirst = false
        nbResults++
      }

      // Fetch remaining pages as streams
      let hasMore = nbTotalResults === 'unknown' || nbResults < nbTotalResults

      // We define a boolean hasMore to avoid an ESLint error
      while (hasMore) {
        getFeatureUrl.searchParams.set('startIndex', nbResults.toString())
        getFeatureUrl.searchParams.set('count', DEFAULT_PAGE_SIZE.toString())

        const response = await fetchPage(getFeatureUrl.toString(), log, 'stream')
        const pageResults = await streamPage(response, (feature) => {
          if (!isFirst) writer.write(',')
          writer.write(JSON.stringify(feature))
          isFirst = false
        })

        // Added a timeout to prevent server overload that could stop requests.
        // await new Promise(resolve => setTimeout(resolve, 500))

        // If we get a blank page, we've reached the end of data processing and we stop here.
        // We add this condition in case we don't know the number of expected results or if there's a potential error.
        if (pageResults === 0) break
        nbResults += pageResults

        // If we have obtained the expected number of results, we can stop.
        if (nbTotalResults !== 'unknown' && nbResults >= nbTotalResults) hasMore = false

        // If the page is incomplete, the data limit has likely been reached.
        if (pageResults < DEFAULT_PAGE_SIZE) hasMore = false
      }

      writer.write(']}')
      await new Promise<void>((resolve, reject) => {
        writer.end((err: any) => err ? reject(err) : resolve())
      })
    } else {
      // Fetch first page to extract envelope metadata (crs, etc.)
      getFeatureUrl.searchParams.set('startIndex', '0')
      getFeatureUrl.searchParams.set('count', '1')

      const firstResponse = await axios.get(getFeatureUrl.toString(), { responseType: 'text' })
      const firstConverted = convertGmlToGeoJson(firstResponse.data)
      const firstFeatures = firstConverted.features ?? []

      const writer = fs.createWriteStream(destPath)

      // Write envelope from first page
      writer.write('{"type":"FeatureCollection"')
      if (firstConverted.crs) writer.write(`,"crs":${JSON.stringify(firstConverted.crs)}`)
      writer.write(',"features":[')

      let isFirst = true
      let nbResults = 0

      // Write features from first page
      for (const feature of firstFeatures) {
        if (!isFirst) writer.write(',')
        writer.write(JSON.stringify(feature))
        isFirst = false
        nbResults++
      }

      let hasMore = nbTotalResults === 'unknown' || nbResults < nbTotalResults

      // We define a boolean hasMore to avoid an ESLint error
      while (hasMore) {
        getFeatureUrl.searchParams.set('startIndex', nbResults.toString())
        getFeatureUrl.searchParams.set('count', DEFAULT_PAGE_SIZE.toString())

        const response = await fetchPage(getFeatureUrl.toString(), log, 'text')
        const features = convertGmlToGeoJson(response!.data).features ?? []

        for (const feature of features) {
          if (!isFirst) writer.write(',')
          writer.write(JSON.stringify(feature))
          isFirst = false
        }

        // Added a timeout to prevent server overload that could stop requests.
        // await new Promise(resolve => setTimeout(resolve, 500))

        nbResults += features.length

        // If we have obtained the expected number of results, we can stop.
        if (nbTotalResults !== 'unknown' && nbResults >= nbTotalResults) hasMore = false

        // If the page is empty or incomplete, the data limit has likely been reached.
        if (features.length < DEFAULT_PAGE_SIZE) hasMore = false
      }

      writer.write(']}')
      await new Promise<void>((resolve, reject) => {
        writer.end((err: any) => err ? reject(err) : resolve())
      })
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
