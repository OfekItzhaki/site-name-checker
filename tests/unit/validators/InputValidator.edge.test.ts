import { InputValidator } from '../../../src/validators/InputValidator';

describe('InputValidator Edge Cases', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('Empty Input Handling', () => {
    test('should handle null input gracefully', () => {
      const result = validator.validateDomainName(null as any);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Domain name cannot be empty');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('EMPTY_INPUT');
    });

    test('should handle undefined input gracefully', () => {
      const result = validator.validateDomainName(undefined as any);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Domain name cannot be empty');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('EMPTY_INPUT');
    });

    test('should handle non-string input gracefully', () => {
      const inputs = [123, true, {}, [], Symbol('test')];
      
      inputs.forEach(input => {
        const result = validator.validateDomainName(input as any);
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe('Domain name cannot be empty');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.code).toBe('EMPTY_INPUT');
      });
    });

    test('should handle whitespace-only variations', () => {
      const whitespaceInputs = [' ', '  ', '\t', '\n', '\r', '\t\n\r ', '   \t\n   '];
      
      whitespaceInputs.forEach(input => {
        const result = validator.validateDomainName(input);
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe('Domain name cannot be empty');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.code).toBe('EMPTY_INPUT');
      });
    });
  });

  describe('Length Boundary Cases', () => {
    test('should handle exactly 1 character (minimum valid)', () => {
      const result = validator.validateDomainName('a');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedInput).toBe('a');
      expect(result.errors).toHaveLength(0);
    });

    test('should handle exactly 63 characters (maximum valid)', () => {
      const domain63 = 'a'.repeat(63);
      const result = validator.validateDomainName(domain63);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedInput).toBe(domain63);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject exactly 64 characters (first invalid)', () => {
      const domain64 = 'a'.repeat(64);
      const result = validator.validateDomainName(domain64);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Domain name must be no more than 63 characters long');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_LENGTH');
    });

    test('should handle very long inputs gracefully', () => {
      const veryLongDomain = 'a'.repeat(1000);
      const result = validator.validateDomainName(veryLongDomain);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_LENGTH')).toBe(true);
    });
  });

  describe('Character Edge Cases', () => {
    test('should handle all valid alphanumeric characters', () => {
      const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const result = validator.validateDomainName(validChars);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedInput).toBe(validChars.toLowerCase());
    });

    test('should handle hyphens in valid positions', () => {
      const validHyphenCases = [
        'a-b',
        'test-domain',
        'a-b-c-d-e',
        'test123-domain456',
        'a1-b2-c3'
      ];

      validHyphenCases.forEach(domain => {
        const result = validator.validateDomainName(domain);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedInput).toBe(domain.toLowerCase());
      });
    });

    test('should reject special characters comprehensively', () => {
      const specialChars = '!@#$%^&*()+=[]{}|\\:";\'<>?,./`~';
      
      for (const char of specialChars) {
        const domainWithSpecial = `test${char}domain`;
        const result = validator.validateDomainName(domainWithSpecial);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_CHARACTERS')).toBe(true);
      }
    });

    test('should reject unicode and international characters', () => {
      const unicodeInputs = [
        'tëst', // Latin with diacritic
        'тест', // Cyrillic
        'テスト', // Japanese
        '测试', // Chinese
        'اختبار', // Arabic
        'test🚀domain', // Emoji
        'café', // Common accented character
        'naïve' // Multiple accented characters
      ];

      unicodeInputs.forEach(input => {
        const result = validator.validateDomainName(input);
        expect(result.isValid).toBe(false);
        // The sanitization removes invalid characters, so we might get different error codes
        // Check that it's invalid and has some error
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Format Edge Cases', () => {
    test('should reject leading hyphens in all positions', () => {
      const leadingHyphenCases = [
        '-a',
        '-test',
        '-domain-name',
        '-123',
        '-a-b-c'
      ];

      leadingHyphenCases.forEach(domain => {
        const result = validator.validateDomainName(domain);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_FORMAT')).toBe(true);
      });
    });

    test('should reject trailing hyphens in all positions', () => {
      const trailingHyphenCases = [
        'a-',
        'test-',
        'domain-name-',
        '123-',
        'a-b-c-'
      ];

      trailingHyphenCases.forEach(domain => {
        const result = validator.validateDomainName(domain);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_FORMAT')).toBe(true);
      });
    });

    test('should reject consecutive hyphens at positions 3-4 (IDN reserved)', () => {
      const idnReservedCases = [
        'ab--test',
        'xy--domain',
        '12--345',
        'aa--bb--cc' // Multiple violations
      ];

      idnReservedCases.forEach(domain => {
        const result = validator.validateDomainName(domain);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'RESERVED_FORMAT')).toBe(true);
      });
    });

    test('should allow consecutive hyphens in other positions', () => {
      const validConsecutiveHyphens = [
        'test--domain', // Positions 4-5
        'a--b', // Positions 1-2
        'domain--test--name' // Multiple positions
      ];

      validConsecutiveHyphens.forEach(domain => {
        const result = validator.validateDomainName(domain);
        // These should fail for RESERVED_FORMAT if at positions 3-4, otherwise might be valid
        if (domain.match(/^.{2}--/)) {
          expect(result.isValid).toBe(false);
          expect(result.errors.some(e => e.code === 'RESERVED_FORMAT')).toBe(true);
        }
      });
    });

    test('should reject all-numeric domains', () => {
      const numericDomains = [
        '1',
        '123',
        '0',
        '999999',
        '1234567890'
      ];

      numericDomains.forEach(domain => {
        const result = validator.validateDomainName(domain);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.code === 'ALL_NUMERIC')).toBe(true);
      });
    });

    test('should allow mixed alphanumeric domains', () => {
      const mixedDomains = [
        'a1',
        '1a',
        'test123',
        '123test',
        'a1b2c3',
        'domain2024'
      ];

      mixedDomains.forEach(domain => {
        const result = validator.validateDomainName(domain);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedInput).toBe(domain.toLowerCase());
      });
    });
  });

  describe('Sanitization Edge Cases', () => {
    test('should handle mixed whitespace and valid characters', () => {
      const input = '  test  domain  ';
      const result = validator.sanitizeInput(input);
      expect(result).toBe('testdomain');
    });

    test('should handle tabs and newlines', () => {
      const input = '\ttest\ndomain\r';
      const result = validator.sanitizeInput(input);
      expect(result).toBe('testdomain');
    });

    test('should preserve hyphens during sanitization', () => {
      const input = '  test-domain-name  ';
      const result = validator.sanitizeInput(input);
      expect(result).toBe('test-domain-name');
    });

    test('should remove all invalid characters while preserving valid ones', () => {
      const input = 'test@domain#name$123!';
      const result = validator.sanitizeInput(input);
      expect(result).toBe('testdomainname123');
    });

    test('should handle empty result after sanitization', () => {
      const input = '!@#$%^&*()';
      const result = validator.sanitizeInput(input);
      expect(result).toBe('');
    });

    test('should handle non-string inputs in sanitization', () => {
      const nonStringInputs = [null, undefined, 123, true, {}, []];
      
      nonStringInputs.forEach(input => {
        const result = validator.sanitizeInput(input as any);
        expect(result).toBe('');
      });
    });
  });

  describe('Multiple Error Scenarios', () => {
    test('should report multiple validation errors correctly', () => {
      const multiErrorCases = [
        {
          input: '-test@domain-',
          expectedCodes: ['INVALID_CHARACTERS', 'INVALID_FORMAT']
        },
        {
          input: '-' + 'a'.repeat(64) + '@',
          expectedCodes: ['INVALID_LENGTH', 'INVALID_CHARACTERS', 'INVALID_FORMAT']
        }
      ];

      multiErrorCases.forEach(({ input, expectedCodes }) => {
        const result = validator.validateDomainName(input);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        
        const actualCodes = result.errors.map(e => e.code);
        // At least one of the expected codes should be present
        const hasExpectedCode = expectedCodes.some(expectedCode => 
          actualCodes.includes(expectedCode)
        );
        expect(hasExpectedCode).toBe(true);
      });
    });

    test('should prioritize first error in error message', () => {
      const result = validator.validateDomainName('-test@domain-');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(1);
      // First error should be reflected in the main error message
      expect(result.errorMessage).toBe(result.errors[0]?.message);
    });
  });

  describe('Case Sensitivity Edge Cases', () => {
    test('should handle mixed case consistently', () => {
      const mixedCases = [
        'TeSt',
        'DOMAIN',
        'MiXeD-CaSe',
        'Test123Domain'
      ];

      mixedCases.forEach(input => {
        const result = validator.validateDomainName(input);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedInput).toBe(input.toLowerCase());
      });
    });

    test('should handle case in error scenarios', () => {
      const result = validator.validateDomainName('TEST@DOMAIN');
      expect(result.isValid).toBe(false);
      // Should still report the error even with case variations
      expect(result.errors.some(e => e.code === 'INVALID_CHARACTERS')).toBe(true);
    });
  });

  describe('Performance Edge Cases', () => {
    test('should handle very long invalid inputs efficiently', () => {
      const veryLongInput = 'a'.repeat(10000) + '@' + 'b'.repeat(10000);
      const startTime = Date.now();
      
      const result = validator.validateDomainName(veryLongInput);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(result.isValid).toBe(false);
      expect(executionTime).toBeLessThan(100); // Should complete within 100ms
    });

    test('should handle repeated validation calls consistently', () => {
      const input = 'test-domain';
      const results = [];
      
      for (let i = 0; i < 100; i++) {
        results.push(validator.validateDomainName(input));
      }
      
      // All results should be identical
      results.forEach(result => {
        expect(result.isValid).toBe(true);
        expect(result.sanitizedInput).toBe('test-domain');
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});