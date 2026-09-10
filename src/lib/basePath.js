// Single source of truth for the GitHub Pages base path.
// next.config.js is CommonJS and cannot import TypeScript, so this shared
// module stays CommonJS and is consumed by both the Next config and src/lib.
const REPO_BASE_PATH = '/PersionalWebSite';

function resolveBasePath(nodeEnv) {
  return nodeEnv === 'production' ? REPO_BASE_PATH : '';
}

module.exports = {
  REPO_BASE_PATH,
  resolveBasePath,
  basePath: resolveBasePath(process.env.NODE_ENV),
};
