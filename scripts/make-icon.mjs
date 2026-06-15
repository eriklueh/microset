import sharp from "sharp";

// microset mark: solid lime tile + black lowercase "m" (matches the sidebar logo).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#c4f82a"/>
  <text x="512" y="560" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="720"
        fill="#0a0a0a">m</text>
</svg>`;

await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile("scripts/icon-source.png");
console.log("wrote scripts/icon-source.png");
