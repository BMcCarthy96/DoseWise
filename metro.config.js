const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Shim Node.js built-ins used by @anthropic-ai/sdk and @supabase/supabase-js
// server-side code (credential chain, fs access, etc.) that don't exist in React Native
const emptyShim = require.resolve("./shims/empty.js");

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "node:fs": emptyShim,
  "node:path": emptyShim,
  "node:os": emptyShim,
  "node:net": emptyShim,
  "node:tls": emptyShim,
  "node:http": emptyShim,
  "node:https": emptyShim,
  "node:zlib": emptyShim,
  "node:async_hooks": emptyShim,
  "node:child_process": emptyShim,
  "node:worker_threads": emptyShim,
  "node:inspector": emptyShim,
  "node:readline": emptyShim,
  "node:cluster": emptyShim,
  "node:dns": emptyShim,
  "node:dgram": emptyShim,
  "node:vm": emptyShim,
};

module.exports = config;
