# GML to GeoJSON Conversion

WFS 1.0.0 retourne des données en GML2 qui doivent être converties en GeoJSON.

## fast-xml-parser configuration

```typescript
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: true
})
```

Options importantes:
- `ignoreAttributes: false` - garder les attributs XML
- `removeNSPrefix: true` - supprimer les préfixes de namespace
- `attributeNamePrefix: '@_'` - préfixer les attributs pour les distinguer

## Structure GML attendue

```xml<wfs:FeatureCollection>
  <gml:featureMember>
    <ns:Couche>
      <gml:id>...</gml:id>
      <gml:geometry>
        <gml:Point>
          <gml:coordinates>1.5,47.3</gml:coordinates>
        </gml:Point>
      </gml:geometry>
      <propriete1>valeur1</propriete1>
    </ns:Couche>
  </gml:featureMember>
</wfs:FeatureCollection>
```

## Conversion vers GeoJSON

```typescript
const featureCollection = {
  type: 'FeatureCollection',
  features: members.map(member => ({
    type: 'Feature',
    geometry: parseGmlGeometry(member[geomKey]),
    properties: member.properties || {}
  }))
}
```

## Types géométriques supportés

- **Point**: `gml:Point` → `{ type: 'Point', coordinates: [lon, lat] }`
- **LineString**: `gml:LineString` → `{ type: 'LineString', coordinates: [[lon, lat], ...] }`
- **Polygon**: `gml:Polygon` → `{ type: 'Polygon', coordinates: [[[lon, lat], ...]] }`

## Géométries complexes

- MultiGeometry, GeometryCollection: non supportés (retournent null)
- CRS (SRS): non géré automatiquement, les coordonnées sont supposées en WGS84

## Tips

- Les coordonnées GML sont souvent `x,y` (lon,lat), il faut inverser pour GeoJSON
- Utiliser `.toString().split(/[\s,]+/)` pour parser les coordonnées
