import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

import alpinejs from '@astrojs/alpinejs';

import react from '@astrojs/react';

export default defineConfig({
  site: 'https://www.digitallevel.org', // Cambia esto por tu dominio real
  integrations: [tailwind(), alpinejs(), react()],
});