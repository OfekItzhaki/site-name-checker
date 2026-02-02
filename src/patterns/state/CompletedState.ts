import { BaseApplicationState } from './BaseApplicationState';
import { ApplicationStateType } from './IApplicationState';
import type { IApplicationStateContext } from './IApplicationState';
import type { IDomainResult } from '../../models';
import { AvailabilityStatus } from '../../models/AvailabilityStatus';

/**
 * Completed state - domain checking has finished successfully
 * Displays results and allows new searches or retries
 */
export class CompletedState extends BaseApplicationState {
  constructor(context: IApplicationStateContext) {
    super(context);
  }

  /**
   * Get the name of this state
   */
  getStateName(): ApplicationStateType {
    return 'completed' as ApplicationStateType;
  }

  /**
   * Handle user input in completed state
   * @param input - User input string
   */
  override handleInput(input: string): void {
    super.handleInput(input);
    
    // Clear any previous errors when user starts typing new domain
    if (input.trim() !== this.getBaseDomainFromResults()) {
      this.context.errors = [];
    }
  }

  /**
   * Handle form submission in completed state
   * Allows starting a new domain check
   */
  override handleSubmit(): void {
    const input = this.context.currentInput?.trim();
    
    if (!input) {
      this.uiCallbacks?.onValidationError('Please enter a domain name');
      return;
    }

    // Clear previous results if checking a different domain
    if (input.toLowerCase() !== this.getBaseDomainFromResults()) {
      this.clearResults();
    }

    this.context.lastActionAt = new Date();
  }

  /**
   * Handle domain result in completed state
   * This can happen if there are delayed results or retries
   * @param result - Domain availability result
   */
  override handleResult(result: IDomainResult): void {
    super.handleResult(result);
    
    // Update the display with the new result
    this.uiCallbacks?.onResultUpdate(result);
  }

  /**
   * Handle retry request in completed state
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
        result.lastChecked = new Date();
        
        // Update progress
        this.context.progress.completed = Math.max(0, this.context.progress.completed - 1);
        
        // Notify UI of the retry
        this.uiCallbacks?.onResultUpdate(result);
      }
    } else {
      // Retry all failed domains
      let retriedCount = 0;
      this.context.results.forEach(result => {
        if (result.status === AvailabilityStatus.ERROR) {
          result.status = AvailabilityStatus.CHECKING;
          result.retryCount = (result.retryCount || 0) + 1;
          result.lastChecked = new Date();
          result.error = undefined as any;
          retriedCount++;
          
          // Notify UI of the retry
          this.uiCallbacks?.onResultUpdate(result);
        }
      });
      
      if (retriedCount > 0) {
        // Update progress
        this.context.progress.completed = this.context.results.filter(r => 
          r.status !== AvailabilityStatus.CHECKING
        ).length;
        
        // Clear retry-related errors
        this.context.errors = this.context.errors.filter(error => !error.retryable);
      }
    }
    
    this.context.lastActionAt = new Date();
  }

  /**
   * Enter completed state
   * @param context - Application state context
   */
  override onEnter(context: IApplicationStateContext): void {
    super.onEnter(context);
    
    // Ensure progress is accurate
    this.context.progress.completed = this.context.results.filter(r => 
      r.status !== AvailabilityStatus.CHECKING
    ).length;
    
    // Notify UI of state change
    this.uiCallbacks?.onStateChange('completed' as ApplicationStateType, 'checking' as ApplicationStateType);
    
    // Provide final results summary
    this.provideSummary();
  }

  /**
   * Provide a summary of the results
   */
  private provideSummary(): void {
    const available = this.context.results.filter(r => r.status === AvailabilityStatus.AVAILABLE);
    const taken = this.context.results.filter(r => r.status === AvailabilityStatus.TAKEN);
    const errors = this.context.results.filter(r => r.status === AvailabilityStatus.ERROR);
    
    // Log summary for debugging (could be used for analytics)
    console.log(`Domain check completed for "${this.getBaseDomainFromResults()}": ${available.length} available, ${taken.length} taken, ${errors.length} errors`);
  }

  /**
   * Get the base domain from current results
   * @returns Base domain name
   */
  private getBaseDomainFromResults(): string {
    return this.context.results.length > 0 && this.context.results[0] ? this.context.results[0].baseDomain : '';
  }

  /**
   * Check if transition to another state is allowed
   * @param targetState - Target state to transition to
   * @returns True if transition is allowed
   */
  override canTransitionTo(targetState: ApplicationStateType): boolean {
    // From completed, can go to validating (new search), checking (retry), error, or idle
    return targetState === 'validating' || 
           targetState === 'checking' ||
           targetState === 'error' || 
           targetState === 'idle';
  }

  /**
   * Check if there are any failed results that can be retried
   * @returns True if there are retryable failures
   */
  hasRetryableFailures(): boolean {
    return this.context.results.some(r => 
      r.status === AvailabilityStatus.ERROR && 
      (r.retryCount || 0) < 3 // Max 3 retries
    );
  }

  /**
   * Get statistics about the completed check
   * @returns Statistics object
   */
  getStatistics(): {
    total: number;
    available: number;
    taken: number;
    errors: number;
    averageExecutionTime: number;
  } {
    const results = this.context.results;
    const executionTimes = results
      .filter(r => r.executionTime !== undefined)
      .map(r => r.executionTime!);
    
    return {
      total: results.length,
      available: results.filter(r => r.status === AvailabilityStatus.AVAILABLE).length,
      taken: results.filter(r => r.status === AvailabilityStatus.TAKEN).length,
      errors: results.filter(r => r.status === AvailabilityStatus.ERROR).length,
      averageExecutionTime: executionTimes.length > 0 
        ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length 
        : 0
    };
  }
}