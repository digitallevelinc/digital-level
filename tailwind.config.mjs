/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,sss,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				binance: {
					yellow: '#F3BA2F', // El amarillo clásico de Binance
					black: '#0b0e11',  // Fondo oscuro profundo
					gray: '#1e2329',   // Color de las tarjetas (cards)
					textGray: '#848e9c', // Texto secundario
				},
			},
		},
	},
	plugins: [],
}