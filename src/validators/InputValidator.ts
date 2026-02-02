import type { IInputValidator } from './IInputValidator';
import type { IValidationResult, IValidationError } from '../controllers/IDomainController';

/**
 * Input validator for domain names
 * Implements comprehensive domain validation according to RFC standards
 * 
 * Validation Rules:
 * - Length: 1-63 characters
 * - Characters: alphanumeric and hyphens only
 * - Format: no leading or trailing hyphens
 * - No consecutive hyphens at positions 3-4 (reserved for internationalized domains)
 */
export class InputValidator implements IInputValidator {
  private static readonly MIN_LENGTH = 1;
  private static readonly MAX_LENGTH = 63;
  private static readonly VALID_CHAR_REGEX = /^[a-zA-Z0-9-]+$/;
  private static readonly HYPHEN_REGEX = /^-|-$/;
  private static readonly CONSECUTIVE_HYPHEN_REGEX = /^.{2}--/;

  /**
   * Validate a domain name input
   * @param domain - Domain name to validate
   * @returns Validation result with detailed error information
   */
  public validateDomainName(domain: string): IValidationResult {
    const errors: IValidationError[] = [];
    
    // Check if input is empty or invalid type
    if (typeof domain !== 'string' || !domain.trim()) {
      const error: IValidationError = {
        code: 'EMPTY_INPUT',
        message: 'Domain name cannot be empty'
      };
      errors.push(error);
      
      return {
        isValid: false,
        sanitizedDomain: '',
        sanitizedInput: '',
        errors,
        errorMessage: error.message
      };
    }

    // Sanitize input for further validation
    const sanitizedInput = this.sanitizeInput(domain);
    
    // Check if input is empty after sanitization
    if (!sanitizedInput) {
      const error: IValidationError = {
        code: 'EMPTY_INPUT',
        message: 'Domain name cannot be empty'
      };
      errors.push(error);
      
      return {
        isValid: false,
        sanitizedDomain: '',
        sanitizedInput: '',
        errors,
        errorMessage: error.message
      };
    }

    // Validate length
    if (!this.isValidLength(sanitizedInput)) {
      const message = sanitizedInput.length < InputValidator.MIN_LENGTH
        ? `Domain name must be at least ${InputValidator.MIN_LENGTH} character long`
        : `Domain name must be no more than ${InputValidator.MAX_LENGTH} characters long`;
      
      const error: IValidationError = {
        code: 'INVALID_LENGTH',
        message
      };
      errors.push(error);
    }

    // Validate characters - check original trimmed input, not sanitized
    const trimmedInput = domain.trim().toLowerCase();
    if (!this.hasValidCharacters(trimmedInput)) {
      const error: IValidationError = {
        code: 'INVALID_CHARACTERS',
        message: 'Domain name can only contain letters, numbers, and hyphens'
      };
      errors.push(error);
    }

    // Validate format - use sanitized input for format checks
    if (!this.hasValidFormat(sanitizedInput)) {
      const error: IValidationError = {
        code: 'INVALID_FORMAT',
        message: 'Domain name cannot start or end with a hyphen'
      };
      errors.push(error);
    }

    // Check for consecutive hyphens at positions 3-4 (reserved for IDN)
    if (InputValidator.CONSECUTIVE_HYPHEN_REGEX.test(sanitizedInput)) {
      const error: IValidationError = {
        code: 'RESERVED_FORMAT',
        message: 'Domain name cannot have consecutive hyphens at positions 3-4 (reserved for internationalized domains)'
      };
      errors.push(error);
    }

    // Check for all numeric domain (not allowed)
    if (/^\d+$/.test(sanitizedInput)) {
      const error: IValidationError = {
        code: 'ALL_NUMERIC',
        message: 'Domain name cannot be all numeric'
      };
      errors.push(error);
    }

    const isValid = errors.length === 0;
    const primaryError = errors.length > 0 ? errors[0] : undefined;

    return {
      isValid,
      sanitizedDomain: isValid ? sanitizedInput : '',
      sanitizedInput: sanitizedInput,
      errors,
      ...(primaryError && { errorMessage: primaryError.message })
    };
  }

  /**
   * Sanitize and normalize domain input
   * @param input - Raw user input
   * @returns Cleaned and normalized input
   */
  public sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()                    // Remove leading/trailing whitespace
      .toLowerCase()             // Convert to lowercase
      .replace(/\s+/g, '')       // Remove all whitespace
      .replace(/[^a-z0-9-]/g, ''); // Remove invalid characters except alphanumeric and hyphens
  }

  /**
   * Check if domain length is valid (1-63 characters)
   * @param domain - Domain name to check
   * @returns True if length is valid
   */
  public isValidLength(domain: string): boolean {
    return domain.length >= InputValidator.MIN_LENGTH && 
           domain.length <= InputValidator.MAX_LENGTH;
  }

  /**
   * Check if domain contains only valid characters (alphanumeric and hyphens)
   * @param domain - Domain name to check
   * @returns True if characters are valid
   */
  public hasValidCharacters(domain: string): boolean {
    return InputValidator.VALID_CHAR_REGEX.test(domain);
  }

  /**
   * Check if domain format is valid (no leading/trailing hyphens)
   * @param domain - Domain name to check
   * @returns True if format is valid
   */
  public hasValidFormat(domain: string): boolean {
    return !InputValidator.HYPHEN_REGEX.test(domain);
  }
}