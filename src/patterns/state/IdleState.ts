import { BaseApplicationState } from './BaseApplicationState';
import { ApplicationStateType } from './IApplicationState';
import type { IApplicationStateContext } from './IApplicationState';

/**
 * Idle state - initial state when no domain checking is in progress
 * User can input domain names and submit for checking
 */
export class IdleState extends BaseApplicationState {
  constructor(context: IApplicationStateContext) {
    super(context);
  }

  /**
   * Get the name of this state
   */
  getStateName(): ApplicationStateType {
    return 'idle' as ApplicationStateType;
  }

  /**
   * Handle user input in idle state
   * @param input - User input string
   */
  override handleInput(input: string): void {
    super.handleInput(input);
    
    // Clear any previous errors when user starts typing
    this.context.errors = [];
  }

  /**
   * Handle form submission in idle state
   * Validates input and transitions to validating state
   */
  override handleSubmit(): void {
    const input = this.context.currentInput?.trim();
    
    if (!input) {
      this.uiCallbacks?.onValidationError('Please enter a domain name');
      return;
    }

    // Input validation will be handled in the validating state
    // This state just accepts the submission
    this.context.lastActionAt = new Date();
  }

  /**
   * Handle retry request in idle state
   * @param _domain - Domain to retry (optional)
   */
  override handleRetry(_domain?: string): void {
    // In idle state, retry just clears errors and allows new input
    this.context.errors = [];
    this.context.results = [];
    this.context.progress = { completed: 0, total: 0 };
    this.context.lastActionAt = new Date();
  }

  /**
   * Enter idle state
   * @param context - Application state context
   */
  override onEnter(context: IApplicationStateContext): void {
    super.onEnter(context);
    
    // Clear any loading states or temporary data
    this.context.progress = { completed: 0, total: 0 };
    delete this.context.requestId;
    
    // Notify UI of state change
    this.uiCallbacks?.onStateChange(ApplicationStateType.IDLE, context.lastActionAt ? ApplicationStateType.COMPLETED : ApplicationStateType.IDLE);
  }

  /**
   * Check if transition to another state is allowed
   * @param targetState - Target state to transition to
   * @returns True if transition is allowed
   */
  override canTransitionTo(targetState: ApplicationStateType): boolean {
    // From idle, can only go to validating or error states
    // Direct transition to checking is not allowed - must go through validation
    return targetState === ApplicationStateType.VALIDATING || 
           targetState === ApplicationStateType.ERROR;
  }
}