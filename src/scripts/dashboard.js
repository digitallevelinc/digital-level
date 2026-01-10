// src/scripts/dashboard.js

// 1. IMPORTACIONES UNIFICADAS
import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';

// Módulos refactorizados
import { updateComisionesUI } from './dashboard/comisiones.js';
import { updateOperacionesUI } from './dashboard/operaciones.js';
import { updateBancosUI } from './dashboard/bancos.js';

/**
 * 2. FUNCIÓN DE INICIALIZACIÓN
 * Se llama desde el index.astro al cargar la página.
 */
export async function initDashboard() {
    console.log("Sentinel Dashboard: Sincronizando módulos...");

    // Recuperamos credenciales del localStorage (ajusta según tu lógica de login)
    const API_BASE = localStorage.getItem('api_base') || 'https://tu-api.com';
    const token = localStorage.getItem('auth_token');
    const alias = localStorage.getItem('operator_alias') || 'Operador';

    if (!token) {
        console.warn("No se encontró token, redirigiendo...");
        window.location.href = '/login';
        return;
    }

    // Primera carga de datos
    await updateDashboard(API_BASE, token, alias);

    // Opcional: Configurar actualización automática cada 30 segundos
    setInterval(() => updateDashboard(API_BASE, token, alias), 30000);
}

/**
 * 3. FUNCIÓN DE ACTUALIZACIÓN GLOBAL
 * Procesa los datos de la API y los distribuye a cada módulo.
 */
export async function updateDashboard(API_BASE, token, alias, range = {}) {
    if (!token) return;

    try {
        const kpiRes = await fetch(`${API_BASE}/api/kpis`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });

        if (!kpiRes.ok) throw new Error('Fallo en la respuesta de la API');

        const kpis = await kpiRes.json();

        // --- ACTUALIZACIÓN DE MÓDULOS MODULARES ---
        const transactions = kpis.transactions || [];
        
        // Tablas y Cards nuevas
        updateComisionesUI(transactions);
        updateOperacionesUI(transactions);
        
        // Panel de Bancos (Barra Tricolor)
        if (kpis.bankInsights) {
            updateBancosUI(kpis.bankInsights);
        }

        // Secciones de Carteras (P2P, Red, Pay, Switch)
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);

        // Actualización de Alias en UI
        const aliasEl = document.getElementById('operator-alias');
        if (aliasEl) aliasEl.textContent = alias;

        // Actualización de fecha de sincronización
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = `Sincronizado: ${new Date().toLocaleTimeString()}`;

    } catch (err) {
        console.error("Error en sincronización de Sentinel:", err);
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = "Error de conexión con Sentinel";
    }
}