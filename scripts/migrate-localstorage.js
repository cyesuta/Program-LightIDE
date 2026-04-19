/**
 * One-time migration: copy LightIDE localStorage entries from the dev origin
 * (http://127.0.0.1:1430) to the release exe origin (http://tauri.localhost),
 * which live as separate origins in the same WebView2 LevelDB.
 *
 * Usage: node scripts/migrate-localstorage.js
 *
 * Make sure no LightIDE / msedgewebview2 process is holding the DB open.
 */

const path = require('path');
const { ClassicLevel } = require('classic-level');

const FROM_ORIGIN = 'http://127.0.0.1:1430';
const TO_ORIGIN = 'http://tauri.localhost';

const dbPath = path.join(
    process.env.LOCALAPPDATA,
    'com.lightide.app', 'EBWebView', 'Default', 'Local Storage', 'leveldb'
);

const fromKeyPrefix = Buffer.concat([
    Buffer.from('_'),
    Buffer.from(FROM_ORIGIN),
    Buffer.from([0x00, 0x01]),
]);
const toKeyPrefix = Buffer.concat([
    Buffer.from('_'),
    Buffer.from(TO_ORIGIN),
    Buffer.from([0x00, 0x01]),
]);

async function main() {
    console.log(`[migrate] DB:   ${dbPath}`);
    console.log(`[migrate] from: ${FROM_ORIGIN}`);
    console.log(`[migrate] to:   ${TO_ORIGIN}`);

    const db = new ClassicLevel(dbPath, {
        keyEncoding: 'buffer',
        valueEncoding: 'buffer',
    });
    await db.open();

    const writes = [];
    let scanned = 0;
    for await (const [key, value] of db.iterator()) {
        scanned++;
        if (key.length > fromKeyPrefix.length &&
            key.subarray(0, fromKeyPrefix.length).equals(fromKeyPrefix)) {
            const keyName = key.subarray(fromKeyPrefix.length).toString('utf8');
            const newKey = Buffer.concat([toKeyPrefix, key.subarray(fromKeyPrefix.length)]);
            writes.push({ name: keyName, key: newKey, value });
        }
    }

    // Also copy META row (per-origin metadata).
    try {
        const metaKey = Buffer.from('META:' + FROM_ORIGIN);
        const metaVal = await db.get(metaKey);
        const newMetaKey = Buffer.from('META:' + TO_ORIGIN);
        await db.put(newMetaKey, metaVal);
        console.log(`[migrate] copied META row`);
    } catch (e) {
        if (e.code !== 'LEVEL_NOT_FOUND') throw e;
        console.log(`[migrate] no META row at source (skipped)`);
    }

    for (const w of writes) {
        await db.put(w.key, w.value);
        console.log(`[migrate] copied: ${w.name}  (${w.value.length} bytes)`);
    }

    await db.close();
    console.log(`[migrate] scanned ${scanned} entries, copied ${writes.length} keys`);
    if (writes.length === 0) {
        console.log('[migrate] WARNING: nothing matched — check origin is correct.');
    }
}

main().catch(e => {
    console.error('[migrate] FAILED:', e);
    process.exit(1);
});
