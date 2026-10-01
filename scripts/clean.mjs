// Removes the previous build output before tsup runs both build configurations in parallel.
import { rmSync } from 'node:fs';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
