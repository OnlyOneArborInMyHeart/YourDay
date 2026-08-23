import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 浏览器预览，不走 Taro。复用 miniprogram/src/pages/* 与 lib/* 中的"无 wx.* 依赖"部分。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    // 与 Taro 配置里的 __API_BASE__ 保持一致（这里直接给空字符串，相对路径走 proxy）
    __API_BASE__: JSON.stringify(''),
  },
});