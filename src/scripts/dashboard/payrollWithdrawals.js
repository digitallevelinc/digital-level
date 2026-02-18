import { fUSDT, inject } from './utils.js';

const qs = (id) => document.getElementById(id);
// Minimal global hook for DOM-only dashboard
if (typeof window !== 'undefined') {
  window.handleRemovePayrollWithdrawal = window.handleRemovePayrollWithdrawal || null;
}

let _range = { from: undefined, to: undefined };
export function setPayrollRange(range = {}) {
  _range = { from: range.from, to: range.to };
}

function withRange(url) {
  const u = new URL(url, window.location.origin);
  if (_range?.from) u.searchParams.set('from', _range.from);
  if (_range?.to) u.searchParams.set('to', _range.to);
  return u.toString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '---';
    return dt.toLocaleString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '---';
  }
}

function setFeedback(text, tone = 'muted') {
  const el = qs('payroll-withdrawal-feedback');
  if (!el) return;
  const msg = String(text || '').trim();
  if (!msg) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  el.classList.remove('hidden');

  const base =
    'flex items-center gap-2 rounded-md border px-3 py-2 text-[10px] font-black uppercase tracking-widest';
  const ok = 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
  const err = 'border-rose-500/25 bg-rose-500/10 text-rose-300';
  const muted = 'border-white/10 bg-black/20 text-white-500';

  const cls = tone === 'ok' ? ok : tone === 'err' ? err : muted;
  const icon =
    tone === 'ok'
      ? '<i class="fas fa-circle-check"></i>'
      : tone === 'err'
        ? '<i class="fas fa-triangle-exclamation"></i>'
        : '<i class="fas fa-circle-info"></i>';

  el.innerHTML = `<div class="${base} ${cls}">${icon}<span class="truncate">${escapeHtml(msg)}</span></div>`;
}

function renderHistory(items = []) {
  const list = qs('payroll-withdrawal-log');
  if (!list) return;

  if (!items || items.length === 0) {
    list.innerHTML = `
      <div class="text-[9px] font-black uppercase tracking-[0.22em] text-white-600 opacity-60">
        Sin retiros aplicados
      </div>`;
    return;
  }

  list.innerHTML = items.map((row) => {
    const order = escapeHtml(row.orderNumber || '-');
    const amount = Number(row.amount || 0);
    const asset = escapeHtml(row.asset || 'USDT');
    const date = fmtDate(row.timestamp || row.appliedAt);
    const status = escapeHtml(row.status || 'SUCCESS');
    const amt = fUSDT(Math.abs(amount));
    const transferId = escapeHtml(row.transferId || '');

    return `
      <div class="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-white/7 bg-black/20 px-3 py-2">
        <div class="min-w-0">
          <div class="text-[9px] font-black uppercase tracking-[0.22em] text-white-500">Orden</div>
          <div class="text-[11px] font-mono font-black text-white truncate">${order}</div>
          <div class="text-[9px] font-black uppercase tracking-[0.18em] text-white-600 mt-0.5">${escapeHtml(date)}</div>
        </div>
        <div class="text-right">
          <div class="flex items-center justify-end gap-2">
            <div class="text-[11px] font-mono font-black text-rose-300">-${amt}</div>
            <button
              class="payroll-withdrawal-remove shrink-0 h-7 w-7 rounded-md border border-white/10 bg-white/5 hover:bg-rose-500/10 hover:border-rose-500/25 transition-colors"
              title="Quitar del Payroll"
              data-transfer-id="${transferId}"
            >
              <i class="fas fa-xmark text-[12px] text-white/50"></i>
            </button>
          </div>
          <div class="mt-0.5 flex items-center justify-end gap-2">
            <span class="text-[9px] font-black uppercase tracking-[0.18em] text-white-600">${asset}</span>
            <span class="text-[9px] font-black uppercase tracking-[0.18em] ${status === 'SUCCESS' ? 'text-emerald-300' : 'text-white-500'}">${status}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire remove buttons (re-render safe)
  list.querySelectorAll('.payroll-withdrawal-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-transfer-id');
      if (!id) return;
      const ok = window.confirm('Quitar este retiro del Payroll? Esto lo re-incluye en KPIs.');
      if (!ok) return;
      if (window.handleRemovePayrollWithdrawal) {
        await window.handleRemovePayrollWithdrawal(id);
      }
    });
  });
}

async function authedFetchJson(url, token, init = {}) {
  const headers = {
    ...(init.headers || {}),
    'Authorization': `Bearer ${token}`,
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...init, headers });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}

export async function refreshPayrollSummary(API_BASE, token) {
  const url = withRange(`${API_BASE}/api/payroll/summary`);
  const { ok, data } = await authedFetchJson(url, token, { method: 'GET' });
  if (!ok || !data) return null;

  // Keep compatibility with existing comisionOp.js expectations.
  // It expects { totalAmount, percentage } at least.
  inject('op-config-pct', `${Number(data.percentage || 0)}%`);
  inject('op-net-profit', fUSDT(Number(data.totalAmount || 0)).replace('$', ''));
  return data;
}

export async function refreshPayrollWithdrawalHistory(API_BASE, token) {
  const url = withRange(`${API_BASE}/api/payroll/withdrawals?limit=8`);
  const { ok, data } = await authedFetchJson(url, token, { method: 'GET' });
  if (!ok) return;
  renderHistory(data?.history || []);
}

export async function handleWithdrawalByOrder(API_BASE, token, orderNumber) {
  const btn = qs('payroll-withdrawal-save');
  const input = qs('payroll-withdrawal-order');

  const order = String(orderNumber || '').trim();
  if (!order) {
    setFeedback('Pega un Numero de Orden.', 'err');
    return;
  }

  try {
    if (btn) btn.disabled = true;
    setFeedback('Buscando orden...', 'muted');

    const url = `${API_BASE}/api/payroll/withdrawals/by-order`;
    const { ok, status, data } = await authedFetchJson(withRange(url), token, {
      method: 'POST',
      body: JSON.stringify({ orderNumber: order })
    });

    if (!ok) {
      const msg = data?.error || `Error (${status})`;
      setFeedback(msg, 'err');
      return;
    }

    const applied = data?.applied;
    const payroll = data?.payroll;
    const history = data?.history;

    if (payroll) {
      inject('op-config-pct', `${Number(payroll.percentage || 0)}%`);
      inject('op-net-profit', fUSDT(Number(payroll.totalAmount || 0)).replace('$', ''));
    }

    if (history) {
      renderHistory(history);
    } else {
      await refreshPayrollWithdrawalHistory(API_BASE, token);
    }

    if (applied) {
      setFeedback(
        `Aplicado: Orden ${applied.orderNumber} | -${fUSDT(Number(applied.amount || 0))} | ${fmtDate(applied.timestamp)} | ${applied.status || 'SUCCESS'}`,
        'ok'
      );
    } else {
      setFeedback('Retiro aplicado.', 'ok');
    }

    if (input) input.value = '';
  } catch (e) {
    console.error('handleWithdrawalByOrder error:', e);
    setFeedback('Error de red aplicando retiro.', 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function removePayrollWithdrawal(API_BASE, token, transferId) {
  const btn = qs('payroll-withdrawal-save');
  try {
    if (btn) btn.disabled = true;
    setFeedback('Revirtiendo retiro...', 'muted');

    const url = `${API_BASE}/api/payroll/withdrawals/remove`;
    const { ok, status, data } = await authedFetchJson(withRange(url), token, {
      method: 'POST',
      body: JSON.stringify({ transferId })
    });

    if (!ok) {
      setFeedback(data?.error || `Error (${status})`, 'err');
      return;
    }

    const payroll = data?.payroll;
    const history = data?.history;

    if (payroll) {
      inject('op-config-pct', `${Number(payroll.percentage || 0)}%`);
      inject('op-net-profit', fUSDT(Number(payroll.totalAmount || 0)).replace('$', ''));
    }

    if (history) renderHistory(history);
    else await refreshPayrollWithdrawalHistory(API_BASE, token);

    setFeedback('Retiro removido del Payroll.', 'ok');
  } catch (e) {
    console.error('removePayrollWithdrawal error:', e);
    setFeedback('Error de red removiendo retiro.', 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

let _initialized = false;
export function initPayrollWithdrawalsUI(API_BASE, token) {
  if (_initialized) return;
  _initialized = true;

  const btn = qs('payroll-withdrawal-save');
  const input = qs('payroll-withdrawal-order');

  if (btn && input) {
    btn.addEventListener('click', () => handleWithdrawalByOrder(API_BASE, token, input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  }

  // Expose for the history rows (no framework, just DOM)
  window.handleRemovePayrollWithdrawal = async (transferId) => {
    await removePayrollWithdrawal(API_BASE, token, transferId);
  };

  // Initial audit list
  void refreshPayrollWithdrawalHistory(API_BASE, token);
}
