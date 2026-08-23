import { defineConfig } from '@tarojs/cli';
import { WeappTailwindcssDisabled, UnifiedWebpackPluginV5 } from 'weapp-tailwindcss/webpack';

export default defineConfig(async (_, argv) => {
  const isH5 = argv.platform === 'h5';
  return {
    projectName: 'yourday-miniprogram',
    date: '2026-8-24',
    designWidth: 750,
    deviceRatio: { 640: 1.17, 750: 1, 828: 0.905, 375: 2, 414: 1.76 },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: ['@tarojs/plugin-framework-react'],
    defineConstants: {
      __API_BASE__: JSON.stringify(process.env.API_BASE || 'https://api.yourday.app'),
    },
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: 'webpack5',
    cache: { enable: false },
    sass: { resource: [] },
    mini: {
      webpackChain(chain) {
        // 在这里按需挂插件
      },
      postcss: { pxtransform: { enable: true, config: {} } },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: { filename: 'js/[name].[hash:8].js', chunkFilename: 'js/[name].[chunkhash:8].js' },
      miniCssExtractPluginOption: { ignoreOrder: true, filename: 'css/[name].[hash].css' },
      postcss: { autoprefixer: { enable: true } },
      devServer: { port: 8080, host: 'localhost' },
    },
  };
});