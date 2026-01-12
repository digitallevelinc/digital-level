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
    const API_BASE = localStorage.getItem('api_base') || 'http://144.91.110.204:3003';
    const token = localStorage.getItem('auth_token') || localStorage.getItem('session_token');
    const alias = localStorage.getItem('operator_alias') || 'Operador';

    if (!token) {
        console.warn("No se encontró token, redirigiendo...");
        window.location.href = '/login';
        return;
    }

    // Estado de filtro temporal
    let currentRange = getPresetRange('today');
    updateKpiFilterLabel(currentRange.label);

    // Bind de UI de filtros
    setupKpiFilters((range) => {
        currentRange = range;
        updateKpiFilterLabel(range.label);
        updateDashboard(API_BASE, token, alias, range);
    });

    // Primera carga de datos con filtro inicial
    await updateDashboard(API_BASE, token, alias, currentRange);

    // Opcional: Configurar actualización automática cada 30 segundos
    setInterval(() => updateDashboard(API_BASE, token, alias, currentRange), 30000);
}

/**
 * 3. FUNCIÓN DE ACTUALIZACIÓN GLOBAL
 * Procesa los datos de la API y los distribuye a cada módulo.
 */
export async function updateDashboard(API_BASE, token, alias, range = {}) {
    if (!token) return;

    try {
        const params = new URLSearchParams();
        if (range?.from) params.set('from', range.from);
        if (range?.to) params.set('to', range.to);
        const url = `${API_BASE}/api/kpis${params.toString() ? `?${params.toString()}` : ''}`;

        const kpiRes = await fetch(url, { 
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

// --- Filtros KPI ---
function pad(n) { return String(n).padStart(2, '0'); }
function toYmd(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }

function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun..6=Sat
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toYmd(start), to: toYmd(end) };
}

function getPresetRange(preset) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    switch (preset) {
        case 'today':
            return { label: 'Hoy', from: toYmd(today), to: toYmd(today) };
        case 'this_week': {
            const r = getWeekRange(today);
            return { label: 'Esta semana', ...r };
        }
        case 'last_7': {
            const from = new Date(today);
            from.setDate(today.getDate() - 6);
            return { label: 'Últimos 7 días', from: toYmd(from), to: toYmd(today) };
        }
        case 'this_month':
            return { label: 'Mes actual', from: toYmd(startOfMonth), to: toYmd(today) };
        case 'last_30': {
            const from = new Date(today);
            from.setDate(today.getDate() - 29);
            return { label: 'Últimos 30 días', from: toYmd(from), to: toYmd(today) };
        }
        case 'ytd':
            return { label: 'YTD', from: toYmd(startOfYear), to: toYmd(today) };
        case 'all':
            return { label: 'Todo', from: undefined, to: undefined };
        default:
            return { label: 'Personalizado' };
    }
}

function setupKpiFilters(onApply) {
    const presetGroup = document.getElementById('kpi-preset-group');
    const fromEl = document.getElementById('kpi-date-from');
    const toEl = document.getElementById('kpi-date-to');
    const applyBtn = document.getElementById('kpi-apply-range');

    // Presets
    presetGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('.kpi-preset-btn');
        if (!btn) return;
        const preset = btn.getAttribute('data-preset');
        const range = getPresetRange(preset);
        if (range.from) fromEl && (fromEl.value = range.from);
        if (range.to) toEl && (toEl.value = range.to);
        onApply(range);
    });

    // Custom apply
    applyBtn?.addEventListener('click', () => {
        const from = fromEl?.value || undefined;
        const to = toEl?.value || undefined;
        // Validación básica: formato YYYY-MM-DD
        const re = /^\d{4}-\d{2}-\d{2}$/;
        if ((from && !re.test(from)) || (to && !re.test(to))) {
            alert('Formato de fecha inválido. Use YYYY-MM-DD');
            return;
        }
        onApply({ label: 'Personalizado', from, to });
    });
}

function updateKpiFilterLabel(label) {
    const el = document.getElementById('kpi-filter-label');
    if (el) el.textContent = `Rango activo: ${label || 'Hoy'}`;
}