const { resolveBasePath } = require('./src/lib/basePath');

const basePath = resolveBasePath(process.env.NODE_ENV);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
