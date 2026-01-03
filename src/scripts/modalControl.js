// src/scripts/modalControl.js
import { FormValidator } from './validator.js';

export function initModalLogic() {
    const getElements = () => ({
        modal: document.getElementById('registration-modal'),
        form: document.getElementById('registration-form'),
        planBtns: document.querySelectorAll('.plan-btn'),
        planInput: document.getElementById('selected-plan-input'),
        submitBtn: document.getElementById('submit-btn')
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
        if (!planName) return;

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

    // --- BINDEO DE EVENTOS ---
    const setupEventListeners = () => {
        const { form, planBtns } = getElements();

        // Clic en botones de planes
        planBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                window.updateActivePlan(btn.getAttribute('data-plan'));
            };
        });

        // Validación en tiempo real
        form?.querySelectorAll('input').forEach(input => {
            input.oninput = (e) => {
                const { name, value } = e.target;
                if (name === 'phone') {
                    const res = FormValidator.formatAndValidatePhone(value);
                    e.target.value = res.displayValue;
                    setFieldStatus('phone', res.isValid);
                } else if (name === 'email') {
                    setFieldStatus('email', FormValidator.validateEmail(value));
                } else if (name === 'firstname' || name === 'lastname') {
                    const res = FormValidator.validateName(value);
                    e.target.value = res.cleanValue;
                    setFieldStatus(name, res.isValid);
                }
            };
        });

        // Form Submit
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const data = new FormData(form);
                const isValid = FormValidator.isFormValid(data);

                // Validar visualmente todos los campos antes de enviar
                ['firstname', 'lastname', 'email', 'phone'].forEach(field => {
                    const val = data.get(field) || "";
                    let ok = (field === 'phone') ? FormValidator.formatAndValidatePhone(val).isValid :
                             (field === 'email') ? FormValidator.validateEmail(val) :
                             FormValidator.validateName(val).isValid;
                    setFieldStatus(field, ok);
                });

                if (isValid) {
                    const { submitBtn } = getElements();
                    submitBtn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> PROCESANDO...';
                    submitBtn.disabled = true;
                    
                    setTimeout(() => {
                        alert(`¡Registro Exitoso para el plan ${data.get('selected_plan')}!`);
                        window.closeModal();
                        submitBtn.innerHTML = 'Finalizar Registro';
                        submitBtn.disabled = false;
                        form.reset();
                    }, 2000);
                }
            };
        }
    };

    setupEventListeners();
}