# Detailed basemap

`style.json` is the OpenFreeMap Dark style retrieved from https://tiles.openfreemap.org/styles/dark. JSON formatting is normalized. SkyPulse applies dark petrol-blue water, muted green-gray land, subdued boundaries, and readable labels at runtime. A subtle blue atmosphere separates the globe from the dark background and fades out on closer zoom. It prefers English place names when available.

Vector tiles, glyphs, and sprites are loaded directly from https://tiles.openfreemap.org. No credentials or SkyPulse session cookies are sent to this service. Detailed maps require internet access. Requests cover the visible area and zoom level; the renderer manages its tile cache and label placement.

Sources and attribution: [OpenFreeMap](https://openfreemap.org/), [OpenMapTiles](https://openmaptiles.org/), and [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Attribution remains visible in the map. Upstream license notices are included alongside this file.

To change map hosting, update `style.json` source/glyph/sprite URLs and the explicit map host allowlist in `apps/web/nginx.conf`. Do not place private API keys in this public asset. The previous coarse Natural Earth texture was replaced by this zoom-dependent basemap.
