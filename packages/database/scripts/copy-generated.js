// The Prisma client generator emits already-compiled JS/d.ts under
// src/generated (excluded from tsc's own compilation — it's not our
// TypeScript source). This copies it into dist so `dist/index.js`'s
// `require("./generated/client")` resolves at runtime.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "generated");
const dest = path.join(__dirname, "..", "dist", "generated");

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
