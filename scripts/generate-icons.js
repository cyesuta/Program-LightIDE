const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Create a simple icon SVG
const svgIcon = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0066CC;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#00AAFF;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect rx="80" ry="80" width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="310" font-family="monospace" font-size="280" font-weight="bold" 
        fill="white" text-anchor="middle">&lt;/&gt;</text>
</svg>`;

async function generateIcons() {
    const svgBuffer = Buffer.from(svgIcon);

    // Generate different sizes
    const sizes = [32, 128, 256];
    const pngBuffers = [];

    for (const size of sizes) {
        const pngBuffer = await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toBuffer();

        if (size === 32) {
            await sharp(pngBuffer).toFile(path.join(iconsDir, '32x32.png'));
            console.log('Created 32x32.png');
        }
        if (size === 128) {
            await sharp(pngBuffer).toFile(path.join(iconsDir, '128x128.png'));
            console.log('Created 128x128.png');

            // Also create @2x version
            const png2x = await sharp(svgBuffer).resize(256, 256).png().toBuffer();
            await sharp(png2x).toFile(path.join(iconsDir, '128x128@2x.png'));
            console.log('Created 128x128@2x.png');
        }

        pngBuffers.push(pngBuffer);
    }

    // Generate ICO file
    const icoBuffer = await toIco(pngBuffers);
    fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer);
    console.log('Created icon.ico');

    // Generate ICNS placeholder (just a copy of 512px PNG for now)
    const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
    await sharp(png512).toFile(path.join(iconsDir, 'icon.icns.png'));
    // For actual ICNS, we'd need a separate tool, but for Windows dev, we can skip it
    console.log('Created placeholder for icon.icns (as PNG)');

    console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch(console.error);
