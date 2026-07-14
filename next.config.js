/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const repoBasePath = '/PersionalWebSite';

const nextConfig = {
  output: 'export',
  basePath: isProd ? repoBasePath : '',
  assetPrefix: isProd ? `${repoBasePath}/` : '',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
