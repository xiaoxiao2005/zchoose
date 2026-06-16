import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        allowedHosts: ['z-choose.com'],
        port: 5173,
        host: '0.0.0.0', // 允许外部访问, // 监听 0.0.0.0，同一局域网内他人可通过本机 IP:5173 访问
        proxy: {
            '/api': { target: 'http://localhost:3001', changeOrigin: true },
            '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
            '/images': { target: 'http://localhost:3001', changeOrigin: true },
        },
    },
});
