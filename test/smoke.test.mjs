import { test, expect } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
test('package targets node 20+', () => { expect(pkg.engines.node).toBe('>=20'); });
