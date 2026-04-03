export interface PiiConfig {
  enabled: boolean;
  maskEmails: boolean;
  maskCreditCards: boolean;
  maskPhones: boolean;
  maskNinos: boolean;
}

export const DEFAULT_PII_CONFIG: PiiConfig = {
  enabled: true,
  maskEmails: true,
  maskCreditCards: true,
  maskPhones: false,
  maskNinos: true
};

export function redactPII(text: string, config: PiiConfig): string {
    if (!text || !config.enabled) return text;
    
    let redacted = text;
    
    if (config.maskCreditCards) {
      // Basic credit card regex focusing on 13-19 digit boundaries with spaces or dashes
      const ccRegex = /\b(?:\d[ -]*?){13,19}\b/g;
      redacted = redacted.replace(ccRegex, (match) => {
          const digits = match.replace(/[\s-]/g, '');
          if (digits.length >= 13 && digits.length <= 19) {
              return '[CREDIT_CARD_REDACTED]';
          }
          return match;
      });
    }

    if (config.maskEmails) {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;
      redacted = redacted.replace(emailRegex, '[EMAIL_REDACTED]');
    }

    if (config.maskNinos) {
      // UK NINO
      const ninoRegex = /\b[A-CEG-HJ-PR-TW-Z]{2}\s*[0-9]{2}\s*[0-9]{2}\s*[0-9]{2}\s*[A-D]\b/gi;
      redacted = redacted.replace(ninoRegex, '[NINO_REDACTED]');
      
      // US SSN
      const ssnRegex = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
      redacted = redacted.replace(ssnRegex, '[SSN_REDACTED]');
    }

    if (config.maskPhones) {
      // Generic phone number matching that focuses on structural layout. Highly prone to false positives
      // which is why the toggle defaults to false.
      const phoneRegex = /\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\b/g;
      redacted = redacted.replace(phoneRegex, '[PHONE_REDACTED]');
    }
    
    return redacted;
}
