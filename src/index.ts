#!/usr/bin/env node

import { main } from './main.js';

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
