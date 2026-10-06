import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdkRoot = dirname(require.resolve('@colyseus/sdk/package.json'));
const packageInfo = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8'));
const framework = fileURLToPath(new URL('../game-framework/', import.meta.url));
const bundle = readFileSync(join(sdkRoot, 'dist/colyseus.js'), 'utf8');
const headers = readFileSync(new URL('./colyseus-headers.js', import.meta.url), 'utf8');

writeFileSync(
    join(framework, 'colyseus-cocos-creator.js'),
    `// Official @colyseus/sdk ${packageInfo.version}. Regenerate with pnpm sync:colyseus.\n` +
        headers +
        '\n' +
        bundle.replace(/\/\/# sourceMappingURL=.*$/gm, '').trimEnd() + '\n',
);
writeFileSync(
    join(framework, 'colyseus-cocos-creator.d.ts'),
    '// Types match the pinned official SDK; do not duplicate its declarations.\n' +
        "export * from '@colyseus/sdk';\nexport as namespace Colyseus;\n",
);
console.info(`Synced Cocos Colyseus SDK ${packageInfo.version}.`);
