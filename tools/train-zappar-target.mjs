import { readFile, writeFile } from 'node:fs/promises';
import { train } from '@zappar/imagetraining';

const sourcePath = new URL('../public/assets/target.jpg', import.meta.url);
const outputPath = new URL('../public/assets/target.zpt', import.meta.url);
const source = await readFile(sourcePath);

console.log('Training Zappar target from target.jpg (this can take 20–30 seconds)…');
const target = await train(source, {
  // Keep the embedded preview for easier target diagnostics during the A/B test.
  excludePreview: false,
  maxWidth: 500,
  maxHeight: 500,
});
await writeFile(outputPath, target);
console.log(`Wrote ${outputPath.pathname} (${target.length} bytes)`);
