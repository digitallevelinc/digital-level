import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://www.digitallevel.org', // Cambia esto por tu dominio real
  integrations: [tailwind()],
});