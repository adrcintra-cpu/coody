import { defineConfig } from 'vite';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import tailwindcss from '@tailwindcss/postcss';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'node:url';
export default defineConfig({
  define: { 'process.env.NEXT_PUBLIC_COODY_HOSTING': JSON.stringify('vercel') },
  resolve: { alias: { 'tailwindcss': require.resolve('tailwindcss/index.css'), 'tw-animate-css': fileURLToPath(new URL('./node_modules/tw-animate-css/dist/tw-animate.css', import.meta.url)), 'shadcn/tailwind.css': require.resolve('shadcn/tailwind.css'), 'cloudflare:workers': fileURLToPath(new URL('./lib/vercel-env.ts', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [vinext(), nitro({ preset: 'vercel' })],
});
