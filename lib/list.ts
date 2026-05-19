import { XMLParser } from 'fast-xml-parser'
import axios from '@data-fair/lib-node/axios.js'
import type { CatalogPlugin, Folder, ListContext } from '@data-fair/types-catalogs'
import type { WFSConfig } from '#types'
import type { WFSCapabilities } from './capabilities.ts'
import memoize from 'memoizee'

type ResourceList = Awaited<ReturnType<CatalogPlugin['list']>>['results']

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true
})

interface WFSFeatureType {
  name: string
  title?: string
  abstract?: string
  keywords?: string[]
}

const fetchFeatureTypes = memoize(async (capabilitiesUrl: string): Promise<WFSFeatureType[]> => {
  const response = await axios.get(capabilitiesUrl)
  const parsed = parser.parse(response.data)

  const ftList = parsed?.WFS_Capabilities?.FeatureTypeList?.FeatureType

  if (!ftList) {
    return []
  }

  const ftArray = Array.isArray(ftList) ? ftList : [ftList]
  return ftArray.map((ft: any) => {
    const keywordsNode = ft.Keywords || ft['ows:Keywords']
    let keywords: string[] | undefined
    if (keywordsNode) {
      const kwArray = Array.isArray(keywordsNode.Keyword)
        ? keywordsNode.Keyword
        : keywordsNode.Keyword ? [keywordsNode.Keyword] : []
      const filtered = kwArray.filter(Boolean) as string[]
      keywords = filtered.length > 0 ? filtered : undefined
    }
    return {
      name: ft.Name || ft.name,
      title: ft.Title || ft.title || ft.Name || ft.name,
      abstract: ft.Abstract || ft.abstract,
      keywords
    }
  })
}, {
  promise: true,
  maxAge: 10 * 60 * 1000,
  primitive: true
})

export const list = async ({ catalogConfig, params }: ListContext<WFSConfig, WFSCapabilities>): ReturnType<CatalogPlugin['list']> => {
  const version = catalogConfig.version || '2.0.0'

  const capabilitiesUrl = new URL(catalogConfig.url)
  capabilitiesUrl.searchParams.set('service', 'WFS')
  capabilitiesUrl.searchParams.set('version', version)
  capabilitiesUrl.searchParams.set('request', 'GetCapabilities')

  let featureTypes: WFSFeatureType[]

  try {
    featureTypes = await fetchFeatureTypes(capabilitiesUrl.toString())
  } catch (error: any) {
    console.error('Erreur lors de la récupération des FeatureTypes:', error.message)
    return { count: 0, results: [], path: [] }
  }

  const folders : Folder[] = []
  const folderIds = new Set<string>()
  const resources : ResourceList = []
  let parentId: string | undefined = params.currentFolderId ? params.currentFolderId + ':' : ''

  for (const feature of featureTypes) {
    if (feature.name.startsWith(parentId)) {
      const subName = feature.name.substring(parentId.length)
      const structure = subName.split(':')

      if (structure.length === 1) {
        const resourceList: ResourceList[number] = {
          id: feature.name,
          title: feature.title ?? 'unnamed',
          description: feature.abstract,
          format: 'geojson',
          type: 'resource'
        }
        resources.push(resourceList)
      } else if (structure.length > 1) {
        const folderId = `${parentId}${structure[0]}`
        if (!folderIds.has(folderId)) {
          const folder: Folder = {
            id: folderId,
            title: structure[0],
            type: 'folder'
          }
          folderIds.add(folderId)
          folders.push(folder)
        }
      }
    }
  }

  const pathFolder: Folder[] = []
  parentId = params.currentFolderId
  while (parentId && parentId !== '') {
    pathFolder.unshift({
      id: parentId,
      title: parentId.substring(parentId.lastIndexOf(':') + 1),
      type: 'folder'
    })
    parentId = parentId.substring(0, parentId.lastIndexOf(':'))
  }

  folders.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  resources.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  const listResults: (Folder | ResourceList[number])[] = [...folders, ...resources]

  let results = listResults

  if (params?.q) {
    const searchTerm = params.q.toLowerCase()
    results = (results as ResourceList).filter(item =>
      item.title?.toLowerCase().includes(searchTerm) ||
      ('description' in item && item.description?.toLowerCase().includes(searchTerm))
    )
  }

  const count = results.length

  if (params?.page && params?.size) {
    const page = Number(params.page)
    const size = Number(params.size)
    const startIndex = (page - 1) * size
    results = results.slice(startIndex, startIndex + size)
  }

  return {
    count,
    results,
    path: pathFolder
  }
}
