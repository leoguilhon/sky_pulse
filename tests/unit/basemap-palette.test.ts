import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { StyleSpecification } from "maplibre-gl";
import { applyBasemapPalette } from "../../apps/web/src/globe/basemap-palette";

test("all bundled map surfaces have visible colors, including airport polygons and outlines", () => {
  const style = JSON.parse(
    readFileSync("apps/web/public/maps/style.json", "utf8"),
  ) as StyleSpecification;
  style.layers.push({
    id: "future-landuse",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landuse",
  });
  applyBasemapPalette(style);
  for (const layer of style.layers) {
    if (
      layer.type !== "fill" &&
      layer.type !== "line" &&
      layer.type !== "background"
    )
      continue;
    const paint = layer.paint as Record<string, unknown>;
    const color = paint[`${layer.type}-color`];
    assert.equal(typeof color, "string", layer.id);
    assert.match(color as string, /^#[0-9a-f]{6}$/i, layer.id);
    const channels = (color as string)
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16));
    assert.ok(Math.max(...channels) >= 64, layer.id);
    assert.equal(paint[`${layer.type}-pattern`], undefined, layer.id);
    if (layer.type === "fill") assert.equal(paint["fill-outline-color"], color);
  }
  const airport = style.layers.find((layer) => layer.id === "aeroway-area");
  assert.ok(airport?.type === "fill");
  assert.equal(airport.paint?.["fill-color"], "#52665f");
});
