# AGENTS.md - Catalog WFS Plugin

Plugin Data Fair pour l'import de données depuis un service WFS (Web Feature Service).

## Commandes

```bash
# Génère les types depuis les schemas JSON
npm run build-types

# Vérification TypeScript
npm run check-types

# ESLint avec neostandard
npm run lint

# Run tous les tests
npm run test

# Quality check: lint + build-types + check-types + test
npm run quality

# Test unique
node --test test-it/index.ts
```

## Code Style

- **ESLint**: neostandard avec `{ ts: true, noJsx: true }`
- **TypeScript**: ES modules, extensions `.js` dans les imports
- **Import aliases**: `#types`, `#type/*` (définis dans package.json)
- **Error handling**: try/catch avec messages en français
- **Naming**: camelCase (fonctions/variables), PascalCase (types/interfaces)

### Import example
```typescript
import type { WFSConfig } from '#types'
import { XMLParser } from 'fast-xml-parser'
import axios from '@data-fair/lib-node/axios.js'
```

## Patterns WFS

### Versions et paramètres
- **WFS 2.0.0**: paramètre `typeNames` (avec 's')
- **WFS 1.1.0**: paramètre `typeName` (sans 's')
- **WFS 1.0.0**: paramètre `typeName` (sans 's')

### outputFormat
- WFS 2.0.0 / 1.1.0: `application/json` (GeoJSON) par défaut
- WFS 1.0.0: `GML2` (converti vers GeoJSON)

### FeatureType names
- Peuvent contenir des namespaces: `sdis29:accident_circulation_sdis29`
- L'id de la ressource doit correspondre exactement au nom du FeatureType

### MetadataURL
- Présent dans la réponse GetCapabilities
- Utiliser pour le champ `origin` de la ressource
- Parser avec: `ft.MetadataURL['@_xlink:href']` ou `ft.MetadataURL['xlink:href']`

## Structure des fichiers

```
catalog-wfs/
├── index.ts                 # Plugin principal
├── lib/
│   ├── capabilities.ts      # Capabilités supportées (search, pagination, import)
│   ├── prepare.ts           # Validation config + DNS check
│   ├── list.ts              # GetCapabilities → liste des FeatureTypes
│   ├── imports.ts           # GetFeature → téléchargement données
│   ├── utils/gml.ts         # Conversion GML vers GeoJSON
│   └── i18n.ts              # Traductions
├── types/
│   └── catalogConfig/      # Schema et types pour la config WFS (url, version)
└── test-it/
    └── index.ts             # Tests avec GeoBretagne WFS
```

## Ressources

- Serveur de test: https://geobretagne.fr/geoserver/ows
- Documentation WFS: https://www.ogc.org/standards/wfs
