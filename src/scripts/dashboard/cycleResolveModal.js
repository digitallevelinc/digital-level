const formatNumber = (value, decimals = 2, locale = 'es-VE') => Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const state = {
    apiBase: '',
    token: '',
    pendingFiat: 0,
    transfers: [],
    preselectedTransferId: null,
};

function getApiBase() {
    if (state.apiBase) return state.apiBase;
    const fromStorage = localStorage.getItem('api_base');
    if (fromStorage) return fromStorage;
    return '';
}

function getToken() {
    if (state.token) return state.token;
    return sessionStorage.getItem('auth_token') || '';
}

function getHeaders() {
    return {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
    };
}

function getElements() {
    return {
        dialog: document.getElementById('cycle-resolve-dialog'),
        closeBtn: document.getElementById('cycle-resolve-close'),
        cancelBtn: document.getElementById('cycle-resolve-cancel'),
        doneBtn: document.getElementById('cycle-resolve-done'),
        submit: document.getElementById('cycle-resolve-submit'),
        form: document.getElementById('cycle-resolve-form'),
        transferSelect: document.getElementById('cycle-resolve-transfer'),
        rateInput: document.getElementById('cycle-resolve-rate'),
        previewValue: document.getElementById('cycle-resolve-preview-value'),
        pendingValue: document.getElementById('cycle-resolve-pending-value'),
        successPanel: document.getElementById('cycle-resolve-success'),
        error: document.getElementById('cycle-resolve-error'),
    };
}

function showError(message) {
    const { error } = getElements();
    if (error) error.textContent = message || '';
}

function updatePreview() {
    const { transferSelect, rateInput, previewValue } = getElements();
    const transferId = transferSelect?.value;
    const rate = Number(rateInput?.value || 0);
    const transfer = state.transfers.find((t) => t.id === transferId);

    if (previewValue) {
        if (transfer && rate > 0) {
            const amount = Number(transfer.amount || 0);
            previewValue.textContent = `${formatNumber(amount * rate)} Bs.`;
        } else {
            previewValue.textContent = '0,00 Bs.';
        }
    }
}

function resetForm() {
    const els = getElements();
    if (els.form) els.form.reset();
    if (els.form) els.form.classList.remove('hidden');
    if (els.successPanel) els.successPanel.classList.add('hidden');
    showError('');
    updatePreview();
}

function populateTransfers() {
    const { transferSelect } = getElements();
    if (!transferSelect) return;

    transferSelect.innerHTML = '';

    if (state.transfers.length === 0) {
        transferSelect.innerHTML = '<option value="">Sin transferencias disponibles</option>';
        return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleccionar ingreso...';
    transferSelect.appendChild(placeholder);

    for (const t of state.transfers) {
        const option = document.createElement('option');
        option.value = t.id;
        const amount = Number(t.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const date = new Date(t.timestamp).toLocaleString('es-VE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        option.textContent = `${t.type} +${amount} USDT · ${t.paymentMethod || 'Sin banco'} · ${date}`;
        transferSelect.appendChild(option);
    }

    if (state.preselectedTransferId) {
        transferSelect.value = state.preselectedTransferId;
    }
}

async function loadData() {
    const { pendingValue } = getElements();
    try {
        const res = await fetch(`${getApiBase()}/api/cycle/pending-fiat`, {
            headers: getHeaders(),
            cache: 'no-store'
        });

        if (!res.ok) {
            throw new Error('No se pudo cargar la información de Bs. pendientes');
        }

        const data = await res.json();
        state.pendingFiat = Number(data.totalPendingFiat || 0);
        state.transfers = Array.isArray(data.availableTransfers) ? data.availableTransfers : [];

        if (pendingValue) {
            pendingValue.textContent = `${formatNumber(state.pendingFiat)} Bs.`;
        }

        populateTransfers();
        updatePreview();
    } catch (err) {
        showError(err?.message || 'Error cargando datos');
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    const { transferSelect, rateInput, submit } = getElements();

    const transferId = transferSelect?.value;
    const manualRate = Number(rateInput?.value || 0);

    if (!transferId) {
        showError('Selecciona una transacción de ingreso');
        return;
    }
    if (!Number.isFinite(manualRate) || manualRate <= 0) {
        showError('Ingresa una tasa de cambio válida');
        return;
    }

    if (submit) {
        submit.disabled = true;
        submit.textContent = 'Aplicando...';
    }

    try {
        const res = await fetch(`${getApiBase()}/api/cycle/resolve`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ transferId, manualRate })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || `Error ${res.status}`);
        }

        const els = getElements();
        if (els.form) els.form.classList.add('hidden');
        if (els.successPanel) els.successPanel.classList.remove('hidden');
        showError('');

        // Notify other dashboard widgets to refresh.
        window.dispatchEvent(new CustomEvent('cycle-resolution-applied', { detail: data }));
    } catch (err) {
        showError(err?.message || 'No se pudo aplicar la resolución');
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'Salvar resolución';
        }
    }
}

function closeModal() {
    const { dialog } = getElements();
    if (dialog) dialog.close();
}

function openModal(preselectedTransferId = null) {
    state.preselectedTransferId = preselectedTransferId;
    const { dialog } = getElements();
    if (!dialog) return;

    resetForm();
    if (!dialog.open) {
        dialog.showModal();
    }
    void loadData();
}

function initCycleResolveModal(options = {}) {
    state.apiBase = String(options.apiBase || getApiBase()).replace(/\/+$/, '');
    state.token = options.token || getToken();

    const els = getElements();

    if (!els.dialog) return;

    els.closeBtn?.addEventListener('click', closeModal);
    els.cancelBtn?.addEventListener('click', closeModal);
    els.doneBtn?.addEventListener('click', closeModal);

    els.transferSelect?.addEventListener('change', updatePreview);
    els.rateInput?.addEventListener('input', updatePreview);

    els.form?.addEventListener('submit', handleSubmit);

    // Close when clicking outside.
    els.dialog.addEventListener('click', (event) => {
        if (event.target === els.dialog) closeModal();
    });

    // Global API for other modules.
    window.openCycleResolveModal = openModal;
}

export { initCycleResolveModal, openModal };
