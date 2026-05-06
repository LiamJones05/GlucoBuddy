import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),

    babel({
      presets: [reactCompilerPreset()]
    }),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'Logo.ico',
        'favicon.svg'
      ],

      manifest: {
        name: 'GlucoBuddy',
        short_name: 'GlucoBuddy',
        description: 'Diabetes management and glucose tracking platform',

        theme_color: '#0b1220',
        background_color: '#0b1220',

        display: 'standalone',
        orientation: 'portrait',

        scope: '/',
        start_url: '/',

        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,

    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});