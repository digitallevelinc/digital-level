// src/scripts/modalControl.js
import { FormValidator } from './validator.js';
import { CheckoutUI } from './checkout.js';

export function initModalLogic() {
    const getElements = () => ({
        modal: document.getElementById('registration-modal'),
        form: document.getElementById('registration-form'),
        planBtns: document.querySelectorAll('.plan-btn'),
        planInput: document.getElementById('selected-plan-input'),
        submitBtn: document.getElementById('submit-btn'),
        header: document.querySelector('#registration-modal header')
    });

    // --- FUNCIONES GLOBALES (Expuestas a Window) ---
    
    window.updateActivePlan = (planName) => {
        const { planBtns, planInput } = getElements();
        if (!planName || !planBtns) return;

        planBtns.forEach(btn => {
            const btnPlan = btn.getAttribute('data-plan');
            const isMatch = btnPlan === planName;
            
            if (isMatch) {
                // Estilo Activo (Amarillo Binance) - Usamos classList para mayor seguridad
                btn.className = "plan-btn py-3 rounded-xl font-black text-[10px] uppercase border transition-all bg-[#F3BA2F] text-black border-[#F3BA2F]";
                if (planInput) planInput.value = planName;
            } else {
                // Estilo Inactivo
                btn.className = "plan-btn py-3 rounded-xl font-black text-[10px] uppercase border transition-all bg-[#0b0e11]/50 border-gray-700 text-gray-500 hover:border-gray-500";
            }
        });
    };

    window.openModal = (requestedPlan) => {
        const { modal } = getElements();
        if (!modal) {
            console.error("Error: No se encontró el modal con ID 'registration-modal'");
            return;
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden'; 
        // Pequeño delay para asegurar que el DOM está listo antes de pintar el plan activo
        setTimeout(() => window.updateActivePlan(requestedPlan || "Pro"), 10);
    };

    window.closeModal = () => {
        const { modal } = getElements();
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = 'auto';
    };

    // --- LÓGICA INTERNA DEL FORMULARIO ---

    const { form, planBtns } = getElements();

    const setFieldStatus = (name, isValid) => {
        const { form } = getElements();
        const input = form?.querySelector(`[name="${name}"]`);
        const errorSpan = document.getElementById(`err-${name}`);
        if (!input) return;

        if (isValid) {
            input.classList.remove('border-red-500');
            input.classList.add('border-[#F3BA2F]');
            errorSpan?.classList.add('hidden');
        } else {
            input.classList.remove('border-[#F3BA2F]');
            input.classList.add('border-red-500');
            errorSpan?.classList.remove('hidden');
        }
    };

    // Listeners para botones de plan (Usando EventListener para evitar colisiones)
    if (planBtns) {
        planBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                window.updateActivePlan(btn.getAttribute('data-plan'));
            });
        });
    }

    if (form) {
        // Validaciones en tiempo real
        form.addEventListener('input', (e) => {
            const { name, value } = e.target;
            if (name === 'phone') {
                const res = FormValidator.formatAndValidatePhone(value);
                e.target.value = res.displayValue; 
                setFieldStatus('phone', res.isValid);
            } else if (name === 'firstname' || name === 'lastname') {
                const res = FormValidator.validateName(value);
                e.target.value = res.cleanValue;
                setFieldStatus(name, res.isValid);
            } else if (name === 'email') {
                setFieldStatus('email', FormValidator.validateEmail(value));
            }
        });

        // Manejo del Envío
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const isFnOk = FormValidator.validateName(formData.get('firstname') || "").isValid;
            const isLnOk = FormValidator.validateName(formData.get('lastname') || "").isValid;
            const isEmOk = FormValidator.validateEmail(formData.get('email') || "");
            const isPhOk = FormValidator.formatAndValidatePhone(formData.get('phone') || "").isValid;

            setFieldStatus('firstname', isFnOk);
            setFieldStatus('lastname', isLnOk);
            setFieldStatus('email', isEmOk);
            setFieldStatus('phone', isPhOk);

            if (isFnOk && isLnOk && isEmOk && isPhOk) {
                const { submitBtn, header } = getElements();
                
                // Prevenir múltiples envíos
                if (submitBtn.disabled) return;
                
                submitBtn.disabled = true;
                const originalBtnContent = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-circle-notch animate-spin text-lg"></i>';

                const prices = { 'Básico': '24.99', 'Pro': '49.99', 'VIP': '99.99' };
                const planKey = formData.get('selected_plan') || "Pro";

                const orderData = {
                    name: `${formData.get('firstname')} ${formData.get('lastname')}`,
                    email: formData.get('email'),
                    phone: formData.get('phone'),
                    plan: planKey,
                    amount: prices[planKey],
                    orderId: 'DL-' + Math.random().toString(36).substr(2, 5).toUpperCase()
                };

                try {
                    // Verificamos si emailjs está cargado para evitar que el script muera
                    if (typeof emailjs !== 'undefined') {
                        await emailjs.send("service_ylhupwp", "template_xnu6xi4", orderData);
                    } else {
                        throw new Error("EmailJS no cargado");
                    }
                } catch (err) {
                    console.error("Error en flujo de email:", err);
                } finally {
                    if (header) header.classList.add('hidden');
                    CheckoutUI.renderReceipt(form, orderData);
                    // No rehabilitamos el botón porque ya mostramos el recibo
                }
            }
        });
    }
}