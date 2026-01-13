// src/scripts/dashboard/fiat.js
import { fVES, inject } from './utils.js';

/**
 * Actualiza la sección de Balance FIAT con los datos provenientes de la API.
 * @param {Object} kpis - El objeto de datos global de la API.
 */
export function updateFiatSection(kpis = {}) {
    // 1. Extraer datos de carteras o métricas (ajustado a tu estructura de API)
    const wallets = kpis.wallets || {};
    const summary = kpis.metrics || kpis.summary || {};
    
    // 2. Mapeo de valores (Balances y Volúmenes)
    // Usamos fallbacks (|| 0) para evitar que el "N/A" rompa la estética si el dato no llega
    const fiatBalance = wallets.fiatBalance ?? wallets.balanceFiat ?? 0;
    
    // Datos detallados de movimientos FIAT
    const totalOps = summary.fiatTotalOps ?? summary.fiatOps ?? 0;
    
    // Ingresos (Depósitos)
    const depoCount = summary.fiatDepoCount ?? 0;
    const depoVol = summary.fiatDepoVol ?? 0;
    
    // Egresos (Retiros)
    const withdrawalCount = summary.fiatWithdrawalCount ?? 0;
    const withdrawalVol = summary.fiatWithdrawalVol ?? 0;

    // 3. Inyección en el DOM con los IDs definidos en fiat.astro
    // fVES se encarga de formatear el número como moneda
    inject('fiat-amount', fVES(fiatBalance));
    
    // Detalles técnicos
    inject('fiat-total-ops', totalOps.toString());
    
    // Bloque de Ingresos
    inject('fiat-depo-count', depoCount.toString());
    inject('fiat-depo-vol', fVES(depoVol));
    
    // Bloque de Egresos
    inject('fiat-withdrawal-count', withdrawalCount.toString());
    inject('fiat-withdrawal-vol', fVES(withdrawalVol));

    // 4. Actualización del link de Google Sheets (opcional si viene en la API)
    const sheetLink = document.getElementById('link-fiat-sheet');
    if (sheetLink && kpis.config?.fiatSheetUrl) {
        sheetLink.href = kpis.config.fiatSheetUrl;
    }
}