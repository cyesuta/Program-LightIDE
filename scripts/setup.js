/**
 * Setup script - Downloads frontend dependencies
 * Run: npm run setup
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');

const DEPENDENCIES = [
    {
        name: 'xterm.min.js',
        url: 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js'
    },
    {
        name: 'xterm.css',
        url: 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css'
    },
    {
        name: 'xterm-addon-fit.min.js',
        url: 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js'
    }
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                download(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function main() {
    console.log('📦 Downloading frontend dependencies...\n');

    // Ensure assets directory exists
    if (!fs.existsSync(ASSETS_DIR)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }

    for (const dep of DEPENDENCIES) {
        const dest = path.join(ASSETS_DIR, dep.name);

        if (fs.existsSync(dest)) {
            console.log(`✓ ${dep.name} (already exists)`);
            continue;
        }

        process.stdout.write(`↓ Downloading ${dep.name}...`);
        try {
            await download(dep.url, dest);
            console.log(' ✓');
        } catch (err) {
            console.log(' ✗');
            console.error(`  Error: ${err.message}`);
            process.exit(1);
        }
    }

    console.log('\n✅ Setup complete!');
}

main();
