const formatNumber = (value, decimals = 2, locale = 'es-VE') => Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
});

function getApiBase() {
    const fromStorage = localStorage.getItem('api_base');
    return fromStorage ? fromStorage.replace(/\/+$/, '') : '';
}

function getToken() {
    return sessionStorage.getItem('auth_token') || '';
}

function getHeaders() {
    return {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
    };
}

function getElements() {
    return {
        btn: document.getElementById('close-cycle-btn'),
        dialog: document.getElementById('close-cycle-dialog'),
        closeBtn: document.getElementById('close-cycle-close'),
        cancelBtn: document.getElementById('close-cycle-cancel'),
        confirmBtn: document.getElementById('close-cycle-confirm'),
        reasonInput: document.getElementById('close-cycle-reason'),
        openCount: document.getElementById('close-cycle-open-count'),
        pendingFiat: document.getElementById('close-cycle-pending-fiat'),
        error: document.getElementById('close-cycle-error'),
    };
}

function showError(message) {
    const { error } = getElements();
    if (error) error.textContent = message || '';
}

function setLoading(loading) {
    const { confirmBtn, btn } = getElements();
    if (confirmBtn) {
        confirmBtn.disabled = loading;
        confirmBtn.textContent = loading ? 'Cerrando...' : 'Sí, cerrar ciclo';
    }
    if (btn) {
        btn.disabled = loading;
    }
}

async function loadPendingSnapshot() {
    const { openCount, pendingFiat } = getElements();
    if (openCount) openCount.textContent = '--';
    if (pendingFiat) pendingFiat.textContent = '--';

    try {
        const res = await fetch(`${getApiBase()}/api/cycle/pending-fiat`, {
            headers: getHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error('No se pudo cargar el resumen del ciclo');
        const data = await res.json();
        const count = Array.isArray(data.pendingVerdicts) ? data.pendingVerdicts.length : 0;
        const totalPending = Number(data.totalPendingFiat || 0);
        if (openCount) openCount.textContent = String(count);
        if (pendingFiat) pendingFiat.textContent = `${formatNumber(totalPending)} Bs.`;
    } catch (_err) {
        if (openCount) openCount.textContent = '?';
        if (pendingFiat) pendingFiat.textContent = '?';
    }
}

function openModal() {
    const { dialog, reasonInput } = getElements();
    if (!dialog) return;
    if (reasonInput) reasonInput.value = '';
    showError('');
    if (!dialog.open) dialog.showModal();
    void loadPendingSnapshot();
}

function closeModal() {
    const { dialog } = getElements();
    if (dialog) dialog.close();
}

async function handleConfirm() {
    const { reasonInput } = getElements();
    const reason = (reasonInput?.value || '').trim();

    setLoading(true);
    showError('');

    try {
        const res = await fetch(`${getApiBase()}/api/cycle/close-manual`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ reason: reason || 'MANUAL_CLOSE' }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || `Error ${res.status}`);
        }

        window.dispatchEvent(new CustomEvent('cycle-closed-manually', { detail: data }));

        if (typeof window.showToast === 'function') {
            window.showToast(data.message || 'Ciclo cerrado manualmente', 'success');
        }

        closeModal();

        if (typeof window.refreshDashboardKpis === 'function') {
            window.refreshDashboardKpis();
        } else {
            window.dispatchEvent(new CustomEvent('kpis:refresh'));
        }
    } catch (err) {
        showError(err?.message || 'No se pudo cerrar el ciclo');
    } finally {
        setLoading(false);
    }
}

function initCloseCycleButton() {
    const els = getElements();
    if (!els.btn || !els.dialog) return;

    const mount = document.getElementById('close-cycle-btn-mount');
    if (mount && els.btn.parentElement !== mount) {
        mount.replaceChildren(els.btn);
        els.btn.classList.remove('hidden');
    }

    els.btn.addEventListener('click', openModal);
    els.closeBtn?.addEventListener('click', closeModal);
    els.cancelBtn?.addEventListener('click', closeModal);
    els.confirmBtn?.addEventListener('click', handleConfirm);

    els.dialog.addEventListener('click', (event) => {
        if (event.target === els.dialog) closeModal();
    });

    els.dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeModal();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloseCycleButton);
} else {
    initCloseCycleButton();
}

export { initCloseCycleButton, openModal };
