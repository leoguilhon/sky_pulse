import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Inputs: Natural Earth v5.1.2 ne_10m_land and
// ne_10m_admin_0_boundary_lines_land, downloaded as GeoJSON. See maps/README.md.
const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: node scripts/build-world-map.mjs <input-directory>");
const land = JSON.parse(await readFile(`${directory}/land.geojson`, "utf8"));
const boundaries = JSON.parse(
  await readFile(`${directory}/boundaries.geojson`, "utf8"),
);
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(
    ({ land, boundaries }) => {
      const size = 2048;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      context.fillStyle = "#163a49";
      context.fillRect(0, 0, size, size);
      const project = ([longitude, latitude]) => {
        const angle =
          (Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI) /
          180;
        return [
          ((longitude + 180) / 360) * size,
          ((1 - Math.asinh(Math.tan(angle)) / Math.PI) / 2) * size,
        ];
      };
      context.fillStyle = "#455953";
      for (const feature of land.features) {
        const polygons =
          feature.geometry.type === "Polygon"
            ? [feature.geometry.coordinates]
            : feature.geometry.coordinates;
        for (const polygon of polygons) {
          context.beginPath();
          for (const ring of polygon) {
            ring.forEach((coordinate, index) => {
              const point = project(coordinate);
              if (index === 0) context.moveTo(...point);
              else context.lineTo(...point);
            });
            context.closePath();
          }
          context.fill("evenodd");
        }
      }
      context.strokeStyle = "rgba(141, 161, 155, 0.42)";
      context.lineWidth = 0.65;
      for (const feature of boundaries.features) {
        const lines =
          feature.geometry.type === "LineString"
            ? [feature.geometry.coordinates]
            : feature.geometry.coordinates;
        for (const line of lines) {
          context.beginPath();
          let previous;
          for (const coordinate of line) {
            const point = project(coordinate);
            if (!previous || Math.abs(point[0] - previous[0]) > size / 2)
              context.moveTo(...point);
            else context.lineTo(...point);
            previous = point;
          }
          context.stroke();
        }
      }
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { land, boundaries },
  );
  await writeFile(
    "apps/web/public/maps/world-base.png",
    Buffer.from(png, "base64"),
  );
} finally {
  await browser.close();
}
