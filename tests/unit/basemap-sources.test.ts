import assert from "node:assert/strict";
import test from "node:test";
import type { StyleSpecification } from "maplibre-gl";
import { isolateBasemapLabels } from "../../apps/web/src/globe/basemap-sources";
import { readFileSync } from "node:fs";
import {
  addWorldBasemap,
  DETAIL_ZOOM,
  WORLD_LAYER,
  WORLD_SOURCE,
} from "../../apps/web/src/globe/world-basemap";

test("label filters use a separate source without invalidating surface tiles", () => {
  const style: StyleSpecification = {
    version: 8,
    sources: {
      world: { type: "vector", url: "https://example.test/tiles.json" },
      "skypulse-labels-world": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [
      { id: "water", type: "fill", source: "world", "source-layer": "water" },
      {
        id: "country",
        type: "symbol",
        source: "world",
        "source-layer": "place",
      },
      { id: "city", type: "symbol", source: "world", "source-layer": "place" },
    ],
  };
  const original = style.sources.world;
  const existing = style.sources["skypulse-labels-world"];
  isolateBasemapLabels(style);
  const [water, country, city] = style.layers;
  assert.ok(
    water?.type === "fill" &&
      country?.type === "symbol" &&
      city?.type === "symbol",
  );
  assert.equal(water.source, "world");
  assert.notEqual(country.source, water.source);
  assert.equal(city.source, country.source);
  assert.deepEqual(style.sources[country.source], original);
  assert.notEqual(style.sources[country.source], original);
  assert.equal(style.sources.world, original);
  assert.equal(style.sources["skypulse-labels-world"], existing);
});

test("the world uses one persistent image and vector surfaces start at regional zoom", () => {
  const style = JSON.parse(
    readFileSync("apps/web/public/maps/style.json", "utf8"),
  ) as StyleSpecification;
  isolateBasemapLabels(style);
  const detailSources = addWorldBasemap(style);
  assert.deepEqual(detailSources, ["openmaptiles"]);
  const source = style.sources[WORLD_SOURCE];
  assert.ok(source?.type === "image");
  assert.equal(source.url, "/maps/world-base.png");
  assert.deepEqual(
    source.coordinates.map(([longitude]) => longitude),
    [-180, 180, 180, -180],
  );
  const baseIndex = style.layers.findIndex((layer) => layer.id === WORLD_LAYER);
  assert.ok(baseIndex >= 0);
  for (const [index, layer] of style.layers.entries()) {
    if (layer.type === "symbol") assert.ok(index > baseIndex);
    else if ("source" in layer && detailSources.includes(layer.source)) {
      assert.ok(index < baseIndex);
      assert.ok(layer.minzoom! >= DETAIL_ZOOM);
    }
  }
  const png = readFileSync("apps/web/public/maps/world-base.png");
  assert.equal(png.readUInt32BE(16), 2048);
  assert.equal(png.readUInt32BE(20), 2048);
  assert.ok(png.length < 1024 * 1024);
});
