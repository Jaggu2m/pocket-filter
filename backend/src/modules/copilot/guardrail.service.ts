import { BadRequestError } from '../../errors/app-error.js';

export interface GuardrailCheckResult {
  passed: boolean;
  sanitizedMessage?: string;
  flaggedReason?: string;
}

export class GuardrailService {
  private readonly PROHIBITED_INPUT_PATTERNS = [
    /ignore (all )?previous instructions/i,
    /you are now an unrestricted (ai|model)/i,
    /system prompt/i,
    /<script/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /truncate\s+table/i,
  ];

  private readonly PROHIBITED_ADVICE_PATTERNS = [
    /\b(guaranteed\s+returns?|will\s+definitely\s+double|100%\s+risk-?free\s+investment)\b/i,
    /\b(buy\s+this\s+stock\s+immediately|invest\s+all\s+in\s+crypto|surefire\s+wealth)\b/i,
  ];

  /**
   * Validates user incoming prompt for malicious payloads or bypasses
   */
  validateInput(message: string): GuardrailCheckResult {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new BadRequestError('Message cannot be empty');
    }

    for (const pattern of this.PROHIBITED_INPUT_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          passed: false,
          flaggedReason: 'Input contains prohibited instructions or unsafe characters.',
        };
      }
    }

    return { passed: true, sanitizedMessage: trimmed };
  }

  /**
   * Verifies that the LLM response does not make illegal financial promises,
   * adheres to safety policies, and includes non-advisory disclosures.
   */
  validateAndEnforceOutput(responseContent: string, engineFacts: any): string {
    let sanitized = responseContent;

    // 1. Check for illegal guaranteed advice
    for (const pattern of this.PROHIBITED_ADVICE_PATTERNS) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(
          pattern,
          'evaluate this carefully as all investments carry risk',
        );
      }
    }

    // 2. Regulatory safety disclaimer
    const disclaimer =
      '\n\n*Note: Pocket Filter provides financial tracking and scenario simulations for decision support, not certified investment advice.*';

    if (!sanitized.includes('Pocket Filter provides financial tracking')) {
      sanitized = sanitized.trim() + disclaimer;
    }

    return sanitized;
  }
}

export const guardrailService = new GuardrailService();
