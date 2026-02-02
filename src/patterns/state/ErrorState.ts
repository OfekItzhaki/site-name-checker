import { BaseApplicationState } from './BaseApplicationState';
import { ApplicationStateType } from './IApplicationState';
import type { IApplicationStateContext } from './IApplicationState';

/**
 * Error state - handles critical errors that prevent normal operation
 * Provides error recovery options and clear error messaging
 */
export class ErrorState extends BaseApplicationState {
  private errorMessage: string = '';
  private isRecoverable: boolean = true;

  constructor(context: IApplicationStateContext) {
    super(context);
  }

  /**
   * Get the name of this state
   */
  getStateName(): ApplicationStateType {
    return 'error' as ApplicationStateType;
  }

  /**
   * Handle user input in error state
   * @param input - User input string
   */
  override handleInput(input: string): void {
    super.handleInput(input);
    
    // Clear error state when user starts typing (if recoverable)
    if (this.isRecoverable && input.trim() !== '') {
      this.context.errors = [];
      this.errorMessage = '';
    }
  }

  /**
   * Handle form submission in error state
   * Allow retry if error is recoverable
   */
  override handleSubmit(): void {
    if (!this.isRecoverable) {
      this.uiCallbacks?.onError('System error - please refresh the page');
      return;
    }

    const input = this.context.currentInput?.trim();
    
    if (!input) {
      this.uiCallbacks?.onValidationError('Please enter a domain name');
      return;
    }

    // Clear errors and allow retry
    this.context.errors = [];
    this.errorMessage = '';
    this.context.lastActionAt = new Date();
  }

  /**
   * Handle error in error state
   * @param error - Error message or object
   */
  override handleError(error: string | Error): void {
    const errorMessage = error instanceof Error ? error.message : error;
    this.errorMessage = errorMessage;
    
    // Determine if error is recoverable
    this.isRecoverable = this.determineRecoverability(errorMessage);
    
    super.handleError(error);
    
    // If not recoverable, suggest page refresh
    if (!this.isRecoverable) {
      this.uiCallbacks?.onError(`${errorMessage}. Please refresh the page to continue.`);
    }
  }

  /**
   * Handle retry request in error state
   * @param domain - Domain to retry (optional)
   */
  override handleRetry(domain?: string): void {
    if (!this.isRecoverable) {
      this.uiCallbacks?.onError('System error - please refresh the page');
      return;
    }

    // Clear errors and reset state
    this.context.errors = [];
    this.errorMessage = '';
    
    if (domain) {
      // Remove specific domain error
      this.context.errors = this.context.errors.filter(error => error.domain !== domain);
    }
    
    // Reset any failed results to allow retry
    this.context.results.forEach(result => {
      if (result.error) {
        result.error = undefined as any;
        result.retryCount = (result.retryCount || 0) + 1;
      }
    });
    
    this.context.lastActionAt = new Date();
  }

  /**
   * Enter error state
   * @param context - Application state context
   */
  override onEnter(context: IApplicationStateContext): void {
    super.onEnter(context);
    
    // Analyze errors to determine error type and recoverability
    this.analyzeErrors();
    
    // Notify UI of state change
    this.uiCallbacks?.onStateChange('error' as ApplicationStateType, this.getPreviousState());
    
    // Provide error summary
    this.provideErrorSummary();
  }

  /**
   * Analyze errors to determine error characteristics
   */
  private analyzeErrors(): void {
    const errors = this.context.errors;
    
    if (errors.length === 0) {
      this.errorMessage = 'Unknown error occurred';
      this.isRecoverable = true;
      return;
    }

    // Check for critical system errors
    const hasCriticalError = errors.some(error => 
      error.errorType === 'NETWORK' && error.message.includes('ENOTFOUND') ||
      error.message.includes('system') ||
      error.message.includes('critical')
    );

    // Check for validation errors (always recoverable)
    const hasValidationError = errors.some(error => 
      error.errorType === 'INVALID_RESPONSE'
    );

    // Check for timeout errors (recoverable)
    const hasTimeoutError = errors.some(error => 
      error.errorType === 'TIMEOUT'
    );

    // Check for rate limiting (recoverable with delay)
    const hasRateLimitError = errors.some(error => 
      error.errorType === 'RATE_LIMIT'
    );

    if (hasValidationError) {
      this.errorMessage = 'Invalid input provided';
      this.isRecoverable = true;
    } else if (hasRateLimitError) {
      this.errorMessage = 'Rate limit exceeded - please wait before retrying';
      this.isRecoverable = true;
    } else if (hasTimeoutError) {
      this.errorMessage = 'Request timed out - please check your connection and retry';
      this.isRecoverable = true;
    } else if (hasCriticalError) {
      this.errorMessage = 'System error occurred';
      this.isRecoverable = false;
    } else {
      // Multiple errors or unknown error type
      this.errorMessage = `${errors.length} error(s) occurred during domain checking`;
      this.isRecoverable = true;
    }
  }

  /**
   * Determine if an error is recoverable
   * @param errorMessage - Error message to analyze
   * @returns True if error is recoverable
   */
  private determineRecoverability(errorMessage: string): boolean {
    const unrecoverableKeywords = [
      'system',
      'critical',
      'fatal',
      'ENOTFOUND',
      'module not found',
      'cannot resolve'
    ];

    return !unrecoverableKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Provide error summary to UI
   */
  private provideErrorSummary(): void {
    const errorCount = this.context.errors.length;
    const retryableCount = this.context.errors.filter(e => e.retryable).length;
    
    console.error(`Error state entered: ${this.errorMessage} (${errorCount} errors, ${retryableCount} retryable)`);
    
    if (this.isRecoverable && retryableCount > 0) {
      // Suggest retry action
      setTimeout(() => {
        if (this.getStateName() === 'error') {
          this.uiCallbacks?.onError(`${this.errorMessage}. ${retryableCount} error(s) can be retried.`);
        }
      }, 1000);
    }
  }

  /**
   * Get the previous state (for UI transition feedback)
   * @returns Previous state type
   */
  private getPreviousState(): ApplicationStateType {
    // Determine previous state based on context
    if (this.context.results.length > 0) {
      const hasCheckingResults = this.context.results.some(r => r.status === 'checking');
      if (hasCheckingResults) {
        return 'checking' as ApplicationStateType;
      } else {
        return 'completed' as ApplicationStateType;
      }
    } else if (this.context.currentInput) {
      return 'validating' as ApplicationStateType;
    } else {
      return 'idle' as ApplicationStateType;
    }
  }

  /**
   * Check if transition to another state is allowed
   * @param targetState - Target state to transition to
   * @returns True if transition is allowed
   */
  override canTransitionTo(targetState: ApplicationStateType): boolean {
    // From error state, transitions depend on recoverability
    if (!this.isRecoverable) {
      // Only allow transition to idle (reset)
      return targetState === 'idle';
    }

    // If recoverable, allow transition to validating (retry) or idle (reset)
    return targetState === 'validating' || 
           targetState === 'idle' ||
           targetState === 'checking'; // Direct retry
  }

  /**
   * Get error information for debugging
   * @returns Error information object
   */
  getErrorInfo(): {
    message: string;
    isRecoverable: boolean;
    errorCount: number;
    retryableCount: number;
    errors: Array<any>;
  } {
    return {
      message: this.errorMessage,
      isRecoverable: this.isRecoverable,
      errorCount: this.context.errors.length,
      retryableCount: this.context.errors.filter(e => e.retryable).length,
      errors: this.context.errors
    };
  }

  /**
   * Check if the error state allows recovery
   * @returns True if recovery is possible
   */
  canRecover(): boolean {
    return this.isRecoverable;
  }
}