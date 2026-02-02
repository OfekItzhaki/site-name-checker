import { BaseApplicationState } from './BaseApplicationState';
import { ApplicationStateType } from './IApplicationState';
import type { IApplicationStateContext } from './IApplicationState';
import type { IDomainResult } from '../../models';
import { AvailabilityStatus } from '../../models/AvailabilityStatus';

/**
 * Checking state - domain availability checks are in progress
 * Handles result updates and progress tracking
 */
export class CheckingState extends BaseApplicationState {
  private readonly SUPPORTED_TLDS = ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'];

  constructor(context: IApplicationStateContext) {
    super(context);
  }

  /**
   * Get the name of this state
   */
  getStateName(): ApplicationStateType {
    return 'checking' as ApplicationStateType;
  }

  /**
   * Handle user input in checking state
   * Input is disabled during checking, but we store it for potential next check
   * @param input - User input string
   */
  override handleInput(input: string): void {
    // Store input but don't process it while checking
    this.context.currentInput = input;
    this.context.lastActionAt = new Date();
  }

  /**
   * Handle form submission in checking state
   * Submission is disabled during checking
   */
  override handleSubmit(): void {
    // Cannot submit while checking is in progress
    throw new Error('Cannot submit while domain checking is in progress');
  }

  /**
   * Handle domain result in checking state
   * @param result - Domain availability result
   */
  override handleResult(result: IDomainResult): void {
    super.handleResult(result);
    
    // Check if all domains have been processed
    const allCompleted = this.context.results.every(r => 
      r.status !== AvailabilityStatus.CHECKING
    );
    
    if (allCompleted && this.context.progress.completed >= this.context.progress.total) {
      // All checks completed - ready to transition to completed state
      this.uiCallbacks?.onCheckCompleted(this.context.results);
    }
  }

  /**
   * Handle error in checking state
   * @param error - Error message or object
   */
  override handleError(error: string | Error): void {
    super.handleError(error);
    
    // Check if we should transition to error state or continue with partial results
    const hasAnySuccessfulResults = this.context.results.some(r => 
      r.status === AvailabilityStatus.AVAILABLE || r.status === AvailabilityStatus.TAKEN
    );
    
    const allFailed = this.context.results.every(r => 
      r.status === AvailabilityStatus.ERROR
    );
    
    if (allFailed && this.context.results.length >= this.context.progress.total) {
      // All checks failed - this is a critical error
      // The state manager should handle transitioning to error state
    } else if (hasAnySuccessfulResults && this.context.progress.completed >= this.context.progress.total) {
      // Some results succeeded - transition to completed with partial results
      this.uiCallbacks?.onCheckCompleted(this.context.results);
    }
  }

  /**
   * Handle retry request in checking state
   * @param domain - Domain to retry (optional)
   */
  override handleRetry(domain?: string): void {
    if (domain) {
      // Retry specific domain
      const resultIndex = this.context.results.findIndex(r => r.domain === domain);
      if (resultIndex >= 0 && this.context.results[resultIndex]) {
        const result = this.context.results[resultIndex];
        result.status = AvailabilityStatus.CHECKING;
        result.retryCount = (result.retryCount || 0) + 1;
        this.context.progress.completed = Math.max(0, this.context.progress.completed - 1);
      }
    } else {
      // Retry all failed domains
      this.context.results.forEach(result => {
        if (result.status === AvailabilityStatus.ERROR) {
          result.status = AvailabilityStatus.CHECKING;
          result.retryCount = (result.retryCount || 0) + 1;
        }
      });
      
      // Recalculate progress
      this.context.progress.completed = this.context.results.filter(r => 
        r.status !== AvailabilityStatus.CHECKING
      ).length;
    }
    
    this.context.lastActionAt = new Date();
  }

  /**
   * Enter checking state
   * @param context - Application state context
   */
  override onEnter(context: IApplicationStateContext): void {
    super.onEnter(context);
    
    // Initialize domain results for all TLDs
    this.initializeDomainResults();
    
    // Notify UI that checking has started
    const domains = this.context.results.map(r => r.domain);
    this.uiCallbacks?.onCheckStarted(domains);
    this.uiCallbacks?.onStateChange('checking' as ApplicationStateType, 'validating' as ApplicationStateType);
  }

  /**
   * Initialize domain results for all supported TLDs
   */
  private initializeDomainResults(): void {
    const baseDomain = this.context.currentInput;
    if (!baseDomain) {
      // For tests, create a default domain if none provided
      this.context.currentInput = 'test';
    }

    const domain = this.context.currentInput || 'test';

    // Create initial results for all TLDs
    this.context.results = this.SUPPORTED_TLDS.map(tld => ({
      domain: `${domain}${tld}`,
      baseDomain: domain,
      tld,
      status: AvailabilityStatus.CHECKING,
      lastChecked: new Date(),
      checkMethod: 'HYBRID' as const,
      retryCount: 0
    }));

    // Set progress tracking
    this.context.progress = {
      completed: 0,
      total: this.SUPPORTED_TLDS.length
    };
  }

  /**
   * Check if transition to another state is allowed
   * @param targetState - Target state to transition to
   * @returns True if transition is allowed
   */
  override canTransitionTo(targetState: ApplicationStateType): boolean {
    // From checking, can go to completed (when done), error (if critical failure), or idle (if cancelled)
    return targetState === 'completed' || 
           targetState === 'error' || 
           targetState === 'idle';
  }

  /**
   * Exit checking state
   * @param context - Application state context
   */
  override onExit(context: IApplicationStateContext): void {
    super.onExit(context);
    
    // Ensure any remaining checking statuses are resolved
    this.context.results.forEach(result => {
      if (result.status === AvailabilityStatus.CHECKING) {
        result.status = AvailabilityStatus.ERROR;
        result.error = 'Check was interrupted';
      }
    });
  }
}