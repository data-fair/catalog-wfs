import { XMLParser } from 'fast-xml-parser'

export function convertGmlToGeoJson (gml: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true
  })

  const parsed = parser.parse(gml)
  const featureCollection: any = {
    type: 'FeatureCollection',
    features: []
  }

  const rootKey = Object.keys(parsed).find(k => k.toLowerCase().includes('featurecollection'))
  if (!rootKey) return featureCollection

  const root = parsed[rootKey]

  const memberKey = Object.keys(root).find(k => k.toLowerCase().includes('member'))
  if (!memberKey) return featureCollection

  const members = root[memberKey]
  const memberArray = Array.isArray(members) ? members : [members]

  for (const member of memberArray) {
    const featureDataKey = Object.keys(member).find(k => !k.startsWith('@_'))
    if (!featureDataKey) continue

    const featureData = member[featureDataKey]

    let geomKey = Object.keys(featureData).find(k =>
      ['geometry', 'the_geom', 'shape', 'geom'].includes(k.toLowerCase())
    )

    if (!geomKey) {
      geomKey = Object.keys(featureData).find(k =>
        featureData[k] && typeof featureData[k] === 'object' &&
        Object.keys(featureData[k]).some(subK =>
          ['Point', 'LineString', 'Polygon', 'MultiPolygon', 'MultiLineString', 'MultiPoint'].includes(subK)
        )
      )
    }

    const geometry = geomKey ? parseGmlGeometry(featureData[geomKey]) : null

    const props = { ...featureData }
    if (geomKey) delete props[geomKey]

    Object.keys(props).forEach(k => {
      if (k.startsWith('@_')) delete props[k]
    })

    featureCollection.features.push({
      type: 'Feature',
      geometry,
      properties: props
    })
  }

  return featureCollection
}

function extractCoordinatesArray (obj: any): number[][] | null {
  if (!obj || typeof obj !== 'object') return null

  const keys = Object.keys(obj)
  const coordKey = keys.find(k =>
    k.toLowerCase().includes('coordinates') ||
    k.toLowerCase().includes('poslist') ||
    k.toLowerCase() === 'pos'
  )

  if (coordKey && obj[coordKey]) {
    const coordStr = obj[coordKey].toString().trim()
    if (!coordStr) return null

    const coordArray = coordStr.split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n))
    const coordinates: number[][] = []

    for (let i = 0; i < coordArray.length; i += 2) {
      if (coordArray[i] !== undefined && coordArray[i + 1] !== undefined) {
        coordinates.push([coordArray[i], coordArray[i + 1]])
      }
    }
    return coordinates
  }

  for (const k of keys) {
    if (typeof obj[k] === 'object') {
      const res = extractCoordinatesArray(obj[k])
      if (res) return res
    }
  }

  return null
}

function parseGmlGeometry (gmlGeom: any): any {
  if (!gmlGeom) return null

  const type = Object.keys(gmlGeom)[0]
  const data = gmlGeom[type]

  if (type.toLowerCase().includes('point')) {
    const coords = extractCoordinatesArray(data)
    if (coords && coords.length > 0) {
      return { type: 'Point', coordinates: coords[0] }
    }
  }

  if (type.toLowerCase().includes('linestring')) {
    const coords = extractCoordinatesArray(data)
    if (coords) {
      return { type: 'LineString', coordinates: coords }
    }
  }

  if (type.toLowerCase() === 'polygon') {
    const outerKey = Object.keys(data).find(k => k.toLowerCase().includes('exterior') || k.toLowerCase().includes('outer'))
    if (outerKey) {
      const coords = extractCoordinatesArray(data[outerKey])
      if (coords) {
        return { type: 'Polygon', coordinates: [coords] }
      }
    }
  }

  if (type.toLowerCase().includes('multipolygon')) {
    const polygons = data.polygonMember || data['gml:polygonMember']
    if (!polygons) return null

    const polygonArray = Array.isArray(polygons) ? polygons : [polygons]
    const multiCoords: number[][][][] = []

    for (const polyWrapper of polygonArray) {
      const polyKey = Object.keys(polyWrapper).find(k => k.toLowerCase().includes('polygon'))
      if (!polyKey) continue

      const polyData = polyWrapper[polyKey]
      const outerKey = Object.keys(polyData).find(k => k.toLowerCase().includes('exterior') || k.toLowerCase().includes('outer'))

      if (outerKey) {
        const coords = extractCoordinatesArray(polyData[outerKey])
        if (coords) {
          multiCoords.push([coords])
        }
      }
    }

    if (multiCoords.length > 0) {
      return { type: 'MultiPolygon', coordinates: multiCoords }
    }
  }

  return null
}
