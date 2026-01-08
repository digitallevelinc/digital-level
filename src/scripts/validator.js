// src/scripts/validator.js
export const FormValidator = {
    validateName: (value) => {
        // Solo letras y espacios, permitiendo tildes y ñ
        const cleanValue = value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
        return {
            isValid: cleanValue.trim().length >= 3,
            cleanValue
        };
    },

    // Alias para mantener consistencia semántica
    validateLastName: (value) => {
        return FormValidator.validateName(value);
    },

    validateEmail: (email) => {
        // Regex más robusto para validación de emails
        const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase().trim());
    },

    formatAndValidatePhone: (phone) => {
        // 1. Limpiar todo lo que no sea número
        let clean = phone.replace(/\D/g, '');
        
        // 2. Aplicar Formato Progresivo: +XX (XXX) XXX-XXXX
        let visual = "";
        if (clean.length > 0) {
            visual = "+" + clean.substring(0, 2);
            if (clean.length > 2) {
                visual += " (" + clean.substring(2, 5);
                if (clean.length > 5) {
                    visual += ") " + clean.substring(5, 8);
                    if (clean.length > 8) {
                        visual += "-" + clean.substring(8, 12);
                    }
                }
            }
        }

        return {
            // Un número de teléfono internacional suele tener entre 10 y 13 dígitos
            isValid: clean.length >= 10 && clean.length <= 15,
            displayValue: visual,
            rawValue: clean
        };
    },

    isFormValid: (formData) => {
        // Obtenemos los valores del FormData
        const firstNameValue = formData.get('firstname') || "";
        const lastNameValue = formData.get('lastname') || "";
        const emailValue = formData.get('email') || "";
        const phoneValue = formData.get('phone') || "";

        // Ejecutamos las validaciones existentes
        const fn = FormValidator.validateName(firstNameValue);
        const ln = FormValidator.validateLastName(lastNameValue);
        const em = FormValidator.validateEmail(emailValue);
        const ph = FormValidator.formatAndValidatePhone(phoneValue);
        
        // Retornamos true solo si todos los campos son válidos
        return fn.isValid && ln.isValid && em.isValid && ph.isValid;
    }
};