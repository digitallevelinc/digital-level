// src/scripts/checkout.js
export const CheckoutUI = {
    renderReceipt: (container, data) => {
        if (!container) return;
        const prices = { 'Básico': '24.99', 'Pro': '49.99', 'VIP': '99.99' };
        const amount = prices[data.plan] || '49.99';

        container.innerHTML = `
            <div class="animate-in fade-in zoom-in duration-500 space-y-6 text-left">
                <div class="flex justify-center mb-4">
                    <div class="bg-[#F3BA2F]/10 border border-[#F3BA2F]/20 px-4 py-1 rounded-full flex items-center gap-2">
                        <span class="w-2 h-2 bg-[#F3BA2F] rounded-full animate-pulse"></span>
                        <span class="text-[10px] font-bold text-[#F3BA2F] uppercase tracking-widest">Esperando Pago</span>
                    </div>
                </div>

                <div class="text-center space-y-1">
                    <div class="text-gray-500 text-[10px] uppercase font-bold tracking-tighter">ID: ${data.orderId}</div>
                    <div class="text-4xl font-black text-white">$${amount} <span class="text-sm text-gray-500 font-normal">USDT</span></div>
                </div>

                <div class="bg-[#0b0e11]/50 border border-gray-800 rounded-2xl p-5 space-y-3">
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500 font-bold uppercase">Plan</span>
                        <span class="text-white font-black uppercase">${data.plan}</span>
                    </div>
                    <div class="flex justify-between text-xs border-t border-gray-800 pt-3">
                        <span class="text-gray-500 font-bold uppercase">Usuario</span>
                        <span class="text-white font-medium">${data.name}</span>
                    </div>
                </div>

                <div class="flex flex-col items-center gap-4 bg-white/[0.02] border border-dashed border-gray-700 rounded-3xl p-6">
                    <div class="bg-white p-2 rounded-xl">
                        <img src="/img/qr-binance.png" alt="QR" class="w-32 h-32" />
                    </div>
                    <div class="text-center">
                        <p class="text-[9px] text-gray-600 uppercase font-black mb-2 tracking-widest">Binance Pay ID</p>
                        <button type="button" onclick="navigator.clipboard.writeText('578321094')" class="group flex items-center gap-2 bg-[#1e2329] px-4 py-2 rounded-lg border border-gray-800 hover:border-[#F3BA2F] transition-all">
                            <span class="text-[#F3BA2F] font-mono font-bold">578321094</span>
                            <i class="fas fa-copy text-gray-600 group-hover:text-white text-xs"></i>
                        </button>
                    </div>
                </div>

                <a href="https://wa.me/584120000000?text=He%20pagado%20la%20orden%20${data.orderId}" 
                   target="_blank"
                   class="w-full py-4 bg-[#25D366] text-white font-black uppercase tracking-widest rounded-xl text-center block text-xs shadow-lg transition-transform hover:scale-[1.02]">
                    <i class="fab fa-whatsapp text-lg mr-2"></i> Confirmar Pago
                </a>
            </div>
        `;
    }
};