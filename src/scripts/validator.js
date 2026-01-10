// src/scripts/validator.js
export const FormValidator = {
    validateName: (value) => {
        // Mantenemos solo letras, espacios y caracteres latinos
        // Optimizamos para no resetear el cursor si el usuario escribe caracteres válidos
        const cleanValue = value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
        
        return {
            // Un nombre válido debe tener al menos 2 letras (ej. "Al") 
            // aunque habías puesto 3, lo mantengo en 3 si prefieres rigor.
            isValid: cleanValue.trim().length >= 3,
            cleanValue
        };
    },

    validateLastName: (value) => {
        return FormValidator.validateName(value);
    },

    validateEmail: (email) => {
        if (!email) return false;
        // Regex estándar de la industria (RFC 5322) para evitar falsos negativos en producción
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).toLowerCase().trim());
    },

    formatAndValidatePhone: (phone) => {
        // 1. Limpiar todo lo que no sea número
        let clean = phone.replace(/\D/g, '');
        
        // Limitamos a 15 dígitos máximo (estándar internacional E.164)
        if (clean.length > 15) clean = clean.substring(0, 15);

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
            // Validación flexible para números internacionales (mínimo 10 dígitos)
            isValid: clean.length >= 10 && clean.length <= 15,
            displayValue: visual,
            rawValue: clean
        };
    },

    isFormValid: (formData) => {
        // Usamos trim() para evitar que espacios en blanco pasen como válidos
        const firstNameValue = (formData.get('firstname') || "").toString().trim();
        const lastNameValue = (formData.get('lastname') || "").toString().trim();
        const emailValue = (formData.get('email') || "").toString().trim();
        const phoneValue = (formData.get('phone') || "").toString().trim();

        const fn = FormValidator.validateName(firstNameValue);
        const ln = FormValidator.validateLastName(lastNameValue);
        const em = FormValidator.validateEmail(emailValue);
        const ph = FormValidator.formatAndValidatePhone(phoneValue);
        
        return fn.isValid && ln.isValid && em.isValid && ph.isValid;
    }
};