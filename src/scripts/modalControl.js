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

    const setFieldStatus = (name, isValid) => {
        const { form } = getElements();
        const input = form?.querySelector(`[name="${name}"]`);
        const errorSpan = document.getElementById(`err-${name}`);
        if (!input) return;

        if (isValid) {
            input.classList.remove('border-red-500', 'border-gray-700');
            input.classList.add('border-[#F3BA2F]');
            errorSpan?.classList.add('hidden');
        } else {
            input.classList.remove('border-[#F3BA2F]', 'border-gray-700');
            input.classList.add('border-red-500');
            errorSpan?.classList.remove('hidden');
        }
    };

    // --- FUNCIONES GLOBALES ---
    window.updateActivePlan = (planName) => {
        const { planBtns, planInput } = getElements();
        if (!planName || !planBtns) return;

        planBtns.forEach(btn => {
            const isMatch = btn.getAttribute('data-plan') === planName;
            if (isMatch) {
                btn.className = "plan-btn py-3 rounded-xl font-black text-[10px] uppercase border transition-all bg-[#F3BA2F] text-black border-[#F3BA2F]";
                if (planInput) planInput.value = planName;
            } else {
                btn.className = "plan-btn py-3 rounded-xl font-black text-[10px] uppercase border transition-all bg-[#0b0e11]/50 border-gray-700 text-gray-500 hover:border-gray-500";
            }
        });
    };

    window.openModal = (requestedPlan) => {
        const { modal } = getElements();
        if (!modal) return;
        modal.classList.replace('hidden', 'flex');
        document.body.style.overflow = 'hidden';
        window.updateActivePlan(requestedPlan || "Pro");
    };

    window.closeModal = () => {
        const { modal } = getElements();
        if (!modal) return;
        modal.classList.replace('flex', 'hidden');
        document.body.style.overflow = 'auto';
    };

    // --- SETUP DE EVENTOS ---
    const { form, planBtns } = getElements();

    if (planBtns) {
        planBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                window.updateActivePlan(btn.getAttribute('data-plan'));
            };
        });
    }

    if (form) {
        form.querySelectorAll('input').forEach(input => {
            input.oninput = (e) => {
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
            };
        });

        form.onsubmit = (e) => {
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
                
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-circle-notch animate-spin text-lg"></i>';

                // Solo agregamos el campo 'phone' a lo que ya tenías
                const orderData = {
                    name: `${formData.get('firstname')} ${formData.get('lastname')}`,
                    email: formData.get('email'),
                    phone: formData.get('phone'), // <--- Agregado para WhatsApp
                    plan: formData.get('selected_plan') || "Pro",
                    orderId: 'DL-' + Math.random().toString(36).substr(2, 5).toUpperCase()
                };

                setTimeout(() => {
                    // Ocultamos el header y reemplazamos el form con el recibo
                    if (header) header.classList.add('hidden');
                    CheckoutUI.renderReceipt(form, orderData);
                }, 1000);

            }
        };
    }
}