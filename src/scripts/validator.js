// src/scripts/validator.js
export const FormValidator = {
    validateName: (value) => {
        // Solo letras y espacios
        const cleanValue = value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
        return {
            isValid: cleanValue.trim().length >= 3, // Cambiado a 3 mínimo
            cleanValue
        };
    },

    validateEmail: (email) => {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).toLowerCase().trim());
    },

    formatAndValidatePhone: (phone) => {
        // 1. Limpiar todo lo que no sea número
        let clean = phone.replace(/\D/g, '');
        
        // 2. Aplicar Formato: +XX (XXX) XXX-XXXX
        let visual = "";
        if (clean.length > 0) {
            visual = "+" + clean.substring(0, 2); // Asumimos código de país de 2 dígitos por defecto
            if (clean.length > 2) visual += " (" + clean.substring(2, 5);
            if (clean.length > 5) visual += ") " + clean.substring(5, 8);
            if (clean.length > 8) visual += "-" + clean.substring(8, 12);
        }

        return {
            isValid: clean.length >= 10 && clean.length <= 13,
            displayValue: visual,
            rawValue: clean
        };
    },

    isFormValid: (formData) => {
        const fn = FormValidator.validateName(formData.get('firstname') || "");
        const ln = FormValidator.validateName(formData.get('lastname') || "");
        const em = FormValidator.validateEmail(formData.get('email') || "");
        const ph = FormValidator.formatAndValidatePhone(formData.get('phone') || "");
        
        return fn.isValid && ln.isValid && em.isValid && ph.isValid;
    }
};