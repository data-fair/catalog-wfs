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

  const memberKey = Object.keys(parsed).find(k => k.toLowerCase().includes('member'))
  if (!memberKey) return featureCollection

  const members = parsed[memberKey]
  const memberArray = Array.isArray(members) ? members : [members]

  for (const member of memberArray) {
    const geomKey = Object.keys(member).find(k => k !== 'properties' && k !== 'gml:id')
    if (!geomKey) continue

    const geometry = parseGmlGeometry(member[geomKey])
    const props = member.properties || {}

    featureCollection.features.push({
      type: 'Feature',
      geometry,
      properties: props
    })
  }

  return featureCollection
}

function parseGmlGeometry (gmlGeom: any): any {
  if (!gmlGeom) return null

  const type = Object.keys(gmlGeom)[0]

  if (type === 'Point' || type === 'point') {
    const coords = gmlGeom[type]?.coordinates || gmlGeom.coordinates
    if (coords) {
      const coordArray = coords.toString().split(/[\s,]+/).map(Number)
      if (coordArray.length >= 2) {
        return { type: 'Point', coordinates: [coordArray[0], coordArray[1]] }
      }
    }
  }

  if (type === 'LineString' || type === 'LineString') {
    const coords = gmlGeom[type]?.coordinates || gmlGeom.coordinates
    if (coords) {
      const coordArray = coords.toString().split(/[\s,]+/).map(Number)
      const coordinates: number[][] = []
      for (let i = 0; i < coordArray.length; i += 2) {
        if (coordArray[i] !== undefined && coordArray[i + 1] !== undefined) {
          coordinates.push([coordArray[i], coordArray[i + 1]])
        }
      }
      return { type: 'LineString', coordinates }
    }
  }

  if (type === 'Polygon' || type === 'Polygon') {
    const outerKey = Object.keys(gmlGeom).find(k => k.toLowerCase().includes('exterior') || k.toLowerCase().includes('outer'))
    if (outerKey) {
      const ring = gmlGeom[outerKey]
      const coordKey = Object.keys(ring).find(k => k.toLowerCase().includes('coordinates') || k.toLowerCase().includes('poslist'))
      if (coordKey) {
        const coords = ring[coordKey]
        const coordArray = coords.toString().split(/[\s,]+/).map(Number)
        const coordinates: number[][] = []
        for (let i = 0; i < coordArray.length; i += 2) {
          if (coordArray[i] !== undefined && coordArray[i + 1] !== undefined) {
            coordinates.push([coordArray[i], coordArray[i + 1]])
          }
        }
        return { type: 'Polygon', coordinates: [coordinates] }
      }
    }
  }

  return null
}
