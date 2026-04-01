# WFS Protocol Skills

Le protocole WFS (Web Feature Service) est un standard OGC pour servir des données géographiques vectorielles.

## Opérations principales

### GetCapabilities

Récupère les métadonnées du service (liste des FeatureTypes disponibles).

```
URL?service=WFS&version=2.0.0&request=GetCapabilities
```

Réponse XML contenant:
- `FeatureTypeList/FeatureType` - liste des couches disponibles
- Chaque FeatureType peut avoir: `Name`, `Title`, `Abstract`, `MetadataURL`

### GetFeature

Récupère les données géographiques d'un FeatureType.

```
URL?service=WFS&version=2.0.0&request=GetFeature&typeNames=nom_du_featuretype
```

## Différences entre versions

| Version | Paramètre typename | Format natif |
|---------|-------------------|---------------|
| 2.0.0   | `typeNames` (avec s) | JSON, CSV, GML |
| 1.1.0   | `typeName` (sans s) | JSON, CSV, GML |
| 1.0.0   | `typeName` (sans s) | GML2 uniquement |

## outputFormat supportés

Pour WFS 2.0.0 et 1.1.0:
- `application/json` - GeoJSON
- `csv` - données tabulaires

Pour WFS 1.0.0:
- `GML2` - seul format disponible, nécessite conversion

## Tips

- Vérifier le serveur avec GetCapabilities avant d'utiliser GetFeature
- Certains serveurs supportent `outputFormat=text/csv` au lieu de `csv`
- FeatureType names peuvent contenir des namespaces (ex: `sdis29:couche`)
