// Regenerates the DoseWise app icons in assets/ from the brand shield-check
// mark. The rendered PNGs are committed, so this only needs to run when the
// mark or palette changes. Requires a one-off dev install of the renderer:
//   npm i -D @resvg/resvg-js && node scripts/generate-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";

// ── DoseWise brand marks ───────────────────────────────────────────────────
// Shield-check mark on a 24-unit viewBox, matching the icon used throughout the
// app (PhoneFrame, AuthScreen, DisclaimerGate). Palette: teal #0D9488 → #0B7A70.

const SHIELD = "M12 2.4 L19.2 5.1 V10.4 C19.2 14.9 16.1 19 12 20.4 C7.9 19 4.8 14.9 4.8 10.4 V5.1 Z";
const CHECK = "M8.2 12.2 L11 15 L16 9.4";

// Builds a shield-check group scaled to `frac` of a `size`-px canvas, centered.
function mark({ size, frac, shieldFill, shieldStroke = "none", shieldStrokeW = 0, checkColor, checkW = 2.4 }) {
  const k = (size * frac) / 24;
  const tx = (size - 24 * k) / 2;
  const ty = (size - 24 * k) / 2;
  return `
    <g transform="translate(${tx} ${ty}) scale(${k})">
      <path d="${SHIELD}" fill="${shieldFill}" stroke="${shieldStroke}" stroke-width="${shieldStrokeW}" stroke-linejoin="round"/>
      <path d="${CHECK}" fill="none" stroke="${checkColor}" stroke-width="${checkW}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
}

function tealBg(size, radius = 0) {
  return `
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#12A79A"/>
        <stop offset="1" stop-color="#0B7A70"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>`;
}

// iOS app icon — full-bleed teal, solid white shield with a teal check.
function iconSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${tealBg(size)}
    ${mark({ size, frac: 0.58, shieldFill: "#FFFFFF", checkColor: "#0B7A70", checkW: 2.6 })}
  </svg>`;
}

// Android adaptive foreground — white shield + teal check on transparent,
// sized into the center safe zone (backgroundColor supplies the teal in app.json).
function adaptiveSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${mark({ size, frac: 0.44, shieldFill: "#FFFFFF", checkColor: "#0B7A70", checkW: 2.6 })}
  </svg>`;
}

// Splash — white shield + teal check on transparent; splash backgroundColor is
// set to teal in app.json, so this reads as a centered white mark on teal.
function splashSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${mark({ size, frac: 0.34, shieldFill: "#FFFFFF", checkColor: "#0B7A70", checkW: 2.6 })}
  </svg>`;
}

// Web favicon — small, teal ground, white shield with teal check.
function faviconSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${tealBg(size, size * 0.22)}
    ${mark({ size, frac: 0.62, shieldFill: "#FFFFFF", checkColor: "#0B7A70", checkW: 3.0 })}
  </svg>`;
}

function render(svg, size, out) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(out, png);
  console.log(`wrote ${out} (${size}x${size}, ${png.length} bytes)`);
}

const A = "assets";
render(iconSvg(1024), 1024, `${A}/icon.png`);
render(adaptiveSvg(1024), 1024, `${A}/adaptive-icon.png`);
render(splashSvg(1024), 1024, `${A}/splash-icon.png`);
render(faviconSvg(48), 48, `${A}/favicon.png`);
console.log("done");
