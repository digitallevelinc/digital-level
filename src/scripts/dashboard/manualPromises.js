let manualPromisesApiBase = '';
let manualPromisesToken = '';
let manualPromisesInitialized = false;

const money = (value, locale = 'es-VE') => Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const apiUrl = (path) => `${String(manualPromisesApiBase || '').replace(/\/+$/, '')}${path}`;

const headers = () => ({
    Authorization: `Bearer ${manualPromisesToken}`,
    'Content-Type': 'application/json',
});

function getEls() {
    return {
        form: document.getElementById('manual-promises-form'),
        status: document.getElementById('manual-promises-status'),
        list: document.getElementById('manual-promises-list'),
        listCount: document.getElementById('manual-promises-list-count'),
        openCount: document.getElementById('manual-promises-open-count'),
        pendingUsdt: document.getElementById('manual-promises-pending-usdt'),
        pendingFiat: document.getElementById('manual-promises-pending-fiat'),
        error: document.getElementById('manual-promises-form-error'),
        refresh: document.getElementById('manual-promises-refresh'),
        submit: document.getElementById('manual-promises-submit'),
        usdt: document.getElementById('manual-promise-usdt'),
        rate: document.getElementById('manual-promise-rate'),
        fiat: document.getElementById('manual-promise-fiat'),
    };
}

function setStatus(text, tone = 'idle') {
    const { status } = getEls();
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
}

function setError(message = '') {
    const { error } = getEls();
    if (error) error.textContent = message;
}

function syncFiatFromRate() {
    const { usdt, rate, fiat } = getEls();
    if (!usdt || !rate || !fiat) return;
    const usdtValue = Number(usdt.value || 0);
    const rateValue = Number(rate.value || 0);
    if (usdtValue > 0 && rateValue > 0) {
        fiat.value = (usdtValue * rateValue).toFixed(2);
    }
}

function statusLabel(status) {
    const normalized = String(status || 'OPEN').toUpperCase();
    if (normalized === 'PAID') return 'Liquidada';
    if (normalized === 'CANCELLED') return 'Cancelada';
    return 'Abierta';
}

function renderItem(item) {
    const status = String(item?.status || 'OPEN').toLowerCase();
    const isOpen = status === 'open';
    const dueText = item?.dueAt
        ? new Date(item.dueAt).toLocaleDateString('es-VE', { dateStyle: 'medium' })
        : '';
    const createdText = item?.createdAt
        ? new Date(item.createdAt).toLocaleDateString('es-VE', { dateStyle: 'short' })
        : '';

    return `
        <article class="manual-promise-card ${isOpen ? '' : 'is-closed'}" data-manual-promise-id="${escapeHtml(item.id)}">
            <div class="manual-promise-top">
                <div>
                    <div class="manual-promise-bank">${escapeHtml(item.bank || 'Banco')}</div>
                    <div class="manual-promise-name">${escapeHtml(item.counterpartyName || 'Sin nombre')}</div>
                </div>
                <span class="manual-promise-status is-${escapeHtml(status)}">${statusLabel(item.status)}</span>
            </div>

            <div class="manual-promise-metrics">
                <div>
                    <span>Prometido</span>
                    <strong>${money(item.promisedUsdt, 'en-US')} USDT</strong>
                </div>
                <div>
                    <span>Pendiente</span>
                    <strong>${money(item.pendingUsdt, 'en-US')} USDT</strong>
                </div>
                <div>
                    <span>FIAT pendiente</span>
                    <strong>${money(item.pendingFiat)} FIAT</strong>
                </div>
            </div>

            <p class="manual-promise-note">
                Tasa ${money(item.exchangeRate)} · FIAT total ${money(item.promisedFiat)}
                ${dueText ? ` · Limite ${escapeHtml(dueText)}` : ''}
                ${createdText ? ` · Creada ${escapeHtml(createdText)}` : ''}
                ${item.notes ? `<br>${escapeHtml(item.notes)}` : ''}
            </p>

            <div class="manual-promise-actions">
                ${isOpen ? `
                    <button class="manual-promise-pay" type="button" data-manual-promise-action="pay">Liquidar</button>
                    <button class="manual-promise-cancel" type="button" data-manual-promise-action="cancel">Cancelar</button>
                ` : ''}
                <button class="manual-promise-delete" type="button" data-manual-promise-action="delete">Eliminar</button>
            </div>
        </article>
    `;
}

function renderPayload(payload = {}) {
    const { list, listCount, openCount, pendingUsdt, pendingFiat } = getEls();
    const items = Array.isArray(payload.items) ? payload.items : [];
    const summary = payload.summary || {};

    if (openCount) openCount.textContent = money(summary.openCount || 0, 'en-US');
    if (pendingUsdt) pendingUsdt.textContent = `${money(summary.pendingUsdt || 0, 'en-US')} USDT`;
    if (pendingFiat) pendingFiat.textContent = `${money(summary.pendingFiat || 0)} FIAT`;
    if (listCount) listCount.textContent = `${items.length} registro${items.length === 1 ? '' : 's'}`;

    if (!list) return;
    if (!items.length) {
        list.innerHTML = '<div class="manual-promises-empty">No hay promesas manuales registradas.</div>';
        return;
    }

    list.innerHTML = items.map(renderItem).join('');
}

async function requestJson(path, options = {}) {
    const res = await fetch(apiUrl(path), {
        ...options,
        headers: {
            ...headers(),
            ...(options.headers || {}),
        },
        cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`);
    }
    return data;
}

export async function refreshManualPromisesUI() {
    if (!manualPromisesApiBase || !manualPromisesToken) return;
    const { list } = getEls();
    try {
        setStatus('Cargando', 'loading');
        if (list && !list.children.length) {
            list.innerHTML = '<div class="manual-promises-empty">Cargando promesas manuales...</div>';
        }
        const payload = await requestJson('/api/manual-promises');
        renderPayload(payload);
        setStatus('Actualizado', 'ok');
    } catch (error) {
        setStatus('Error', 'error');
        if (list) {
            list.innerHTML = `<div class="manual-promises-empty">${escapeHtml(error?.message || 'No se pudo cargar.')}</div>`;
        }
    }
}

async function submitManualPromise(event) {
    event.preventDefault();
    const { form, submit } = getEls();
    if (!form) return;

    setError('');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        if (submit) {
            submit.disabled = true;
            submit.textContent = 'Registrando...';
        }
        await requestJson('/api/manual-promises', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        form.reset();
        await refreshManualPromisesUI();
        setStatus('Registrada', 'ok');
    } catch (error) {
        setError(error?.message || 'No se pudo registrar');
        setStatus('Error', 'error');
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'Registrar';
        }
    }
}

async function handleListClick(event) {
    const button = event.target.closest('[data-manual-promise-action]');
    if (!button) return;

    const card = button.closest('[data-manual-promise-id]');
    const id = card?.dataset?.manualPromiseId;
    const action = button.dataset.manualPromiseAction;
    if (!id || !action) return;

    const confirmed = action === 'delete'
        ? confirm('Eliminar esta promesa manual?')
        : action === 'cancel'
            ? confirm('Cancelar esta promesa manual?')
            : true;
    if (!confirmed) return;

    button.disabled = true;
    try {
        if (action === 'delete') {
            await requestJson(`/api/manual-promises/${encodeURIComponent(id)}`, {
                method: 'DELETE',
            });
        } else {
            await requestJson(`/api/manual-promises/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: action === 'pay' ? 'PAID' : 'CANCELLED',
                }),
            });
        }
        await refreshManualPromisesUI();
    } catch (error) {
        alert(error?.message || 'No se pudo actualizar la promesa');
    } finally {
        button.disabled = false;
    }
}

export function initManualPromisesUI(apiBase, token) {
    manualPromisesApiBase = apiBase;
    manualPromisesToken = token;

    const { form, refresh, list, usdt, rate } = getEls();
    if (!form || manualPromisesInitialized) {
        void refreshManualPromisesUI();
        return;
    }

    form.addEventListener('submit', submitManualPromise);
    refresh?.addEventListener('click', () => refreshManualPromisesUI());
    list?.addEventListener('click', handleListClick);
    usdt?.addEventListener('input', syncFiatFromRate);
    rate?.addEventListener('input', syncFiatFromRate);

    manualPromisesInitialized = true;
    void refreshManualPromisesUI();
}
