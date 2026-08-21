/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.imagesolymp.xyz',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.imagesolymp.xyz',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.olympusxyz.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'olympusxyz.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'olympusbiblioteca.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
