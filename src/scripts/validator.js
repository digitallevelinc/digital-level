// src/scripts/validator.js
export const FormValidator = {
    validateName: (value) => {
        const cleanValue = value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
        return {
            isValid: cleanValue.trim().length >= 2,
            cleanValue
        };
    },

    validateEmail: (email) => {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).toLowerCase().trim());
    },

    formatAndValidatePhone: (phone) => {
        // Acepta cualquier número, solo limpia caracteres no numéricos
        let clean = phone.replace(/\D/g, '');
        
        // Validación básica: al menos 10 dígitos para ser internacionalmente válido
        return {
            isValid: clean.length >= 10 && clean.length <= 15,
            displayValue: clean.length > 0 ? '+' + clean : '',
            rawValue: clean
        };
    },

    isFormValid: (formData) => {
        const firstname = FormValidator.validateName(formData.get('firstname') || "");
        const lastname = FormValidator.validateName(formData.get('lastname') || "");
        const email = FormValidator.validateEmail(formData.get('email') || "");
        const phone = FormValidator.formatAndValidatePhone(formData.get('phone') || "");
        
        return firstname.isValid && lastname.isValid && email.isValid && phone.isValid;
    }
};