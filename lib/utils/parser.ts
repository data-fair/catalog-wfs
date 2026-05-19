import { XMLParser } from 'fast-xml-parser'

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: true
})
