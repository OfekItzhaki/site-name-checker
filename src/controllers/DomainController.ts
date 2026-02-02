import type { IQueryRequest, IQueryResponse, IQueryError } from '../models';
import { InputValidator } from '../validators/InputValidator';
import { HybridQueryService } from '../services/HybridQueryService';
import { ApplicationStateManager } from '../patterns/state/ApplicationStateManager';
import { ApplicationStateType } from '../patterns/state/IApplicationState';
import { EventBus } from '../patterns/observer/EventBus';
import { DomainCheckCommand } from '../patterns/command/DomainCheckCommand';
import { BatchDomainCheckCommand } from '../patterns/command/BatchDomainCheckCommand';
import { CommandInvoker } from '../patterns/command/CommandInvoker';
import type { IEventBus } from '../patterns/observer/IEventBus';
import type { IQueryStrategy } from '../patterns/strategy/IQueryStrategy';

/**
 * Domain Controller - Main orchestration layer for domain availability checking
 * Coordinates validation, query execution, state management, and event publishing
 */
export class DomainController {
  private validator: InputValidator;
  private defaultStrategy: IQueryStrategy;
  private stateManager: ApplicationStateManager;
  private eventBus: IEventBus;
  private commandInvoker: CommandInvoker;

  constructor() {
    // Initialize core components
    this.validator = new InputValidator();
    this.defaultStrategy = new HybridQueryService(); // Use HybridQueryService as default strategy
    this.stateManager = new ApplicationStateManager();
    this.eventBus = new EventBus();
    this.commandInvoker = new CommandInvoker();

    // Set up event listeners for state changes
    this.setupEventListeners();
  }

  /**
   * Check availability for a single domain
   * @param domainName - Domain name to check
   * @returns Promise resolving to query response
   */
  async checkDomain(domainName: string): Promise<IQueryResponse> {
    const requestId = this.generateRequestId();
    const baseDomain = this.extractBaseDomain(domainName);
    const tld = this.extractTLD(domainName);
    
    // Ensure we have a valid TLD
    if (!tld) {
      const error: IQueryError = {
        domain: domainName,
        errorType: 'INVALID_RESPONSE' as const,
        message: 'Invalid domain format: missing TLD',
        retryable: false,
        timestamp: new Date()
      };

      return {
        requestId,
        results: [],
        errors: [error],
        completedAt: new Date(),
        totalExecutionTime: 0
      };
    }
    
    const tlds = [tld];
    
    const request: IQueryRequest = {
      baseDomain,
      tlds,
      timestamp: new Date(),
      requestId
    };

    try {
      // Transition to validating state
      await this.stateManager.transitionTo(ApplicationStateType.VALIDATING);
      this.publishStateChange('validating', { request });

      // Validate input
      const validationResult = this.validator.validateDomainName(baseDomain);
      if (!validationResult.isValid) {
        // Convert validation errors to query errors
        const errors: IQueryError[] = validationResult.errors.map(error => ({
          domain: domainName,
          errorType: 'INVALID_RESPONSE' as const,
          message: error.message,
          retryable: false,
          timestamp: new Date()
        }));

        await this.stateManager.transitionTo(ApplicationStateType.ERROR);
        this.publishStateChange('error', { request, errors });

        return {
          requestId,
          results: [],
          errors,
          completedAt: new Date(),
          totalExecutionTime: 0
        };
      }

      // Transition to checking state
      await this.stateManager.transitionTo(ApplicationStateType.CHECKING);
      this.publishStateChange('checking', { request });

      // Create and execute domain check command
      const sanitizedDomain = validationResult.sanitizedDomain;
      const fullDomain = sanitizedDomain + tld;
      
      const command = new DomainCheckCommand(
        fullDomain,
        this.defaultStrategy
      );

      const startTime = Date.now();
      const commandResult = await this.commandInvoker.execute(command);
      const executionTime = Date.now() - startTime;

      // Extract the actual result from command result
      const result = commandResult.success && commandResult.data ? commandResult.data : null;
      
      if (!result) {
        const error: IQueryError = {
          domain: domainName,
          errorType: 'NETWORK' as const,
          message: commandResult.error || 'Domain check failed',
          retryable: true,
          timestamp: new Date()
        };

        await this.stateManager.transitionTo(ApplicationStateType.ERROR);
        this.publishStateChange('error', { request, error });

        return {
          requestId,
          results: [],
          errors: [error],
          completedAt: new Date(),
          totalExecutionTime: executionTime
        };
      }

      // Transition to completed state
      await this.stateManager.transitionTo(ApplicationStateType.COMPLETED);
      this.publishStateChange('completed', { request, results: [result] });

      return {
        requestId,
        results: [result],
        errors: [],
        completedAt: new Date(),
        totalExecutionTime: executionTime
      };

    } catch (error) {
      const queryError: IQueryError = {
        domain: domainName,
        errorType: 'NETWORK' as const,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        retryable: true,
        timestamp: new Date()
      };

      await this.stateManager.transitionTo(ApplicationStateType.ERROR);
      this.publishStateChange('error', { request, error: queryError });

      return {
        requestId,
        results: [],
        errors: [queryError],
        completedAt: new Date(),
        totalExecutionTime: 0
      };
    }
  }

  /**
   * Check availability for multiple domains concurrently
   * @param domainNames - Array of domain names to check
   * @returns Promise resolving to query response with all results
   */
  async checkDomains(domainNames: string[]): Promise<IQueryResponse> {
    const requestId = this.generateRequestId();
    const firstDomain = domainNames[0];
    const baseDomain = firstDomain ? this.extractBaseDomain(firstDomain) : '';
    const tlds = domainNames.map(domain => this.extractTLD(domain)).filter((tld): tld is string => tld !== undefined && tld !== '');
    
    const request: IQueryRequest = {
      baseDomain,
      tlds,
      timestamp: new Date(),
      requestId
    };

    try {
      // Transition to validating state
      await this.stateManager.transitionTo(ApplicationStateType.VALIDATING);
      this.publishStateChange('validating', { request });

      // Validate all domains
      const validationResults = domainNames.map(domain => {
        const baseDomainName = this.extractBaseDomain(domain);
        return {
          domain,
          result: this.validator.validateDomainName(baseDomainName)
        };
      });

      const validDomains = validationResults
        .filter(({ result }) => result.isValid)
        .map(({ domain, result }) => {
          const sanitizedBase = result.sanitizedDomain;
          const tld = this.extractTLD(domain);
          return sanitizedBase + (tld || '');
        })
        .filter(domain => domain.includes('.')); // Only keep domains with valid TLDs

      const validationErrors: IQueryError[] = validationResults
        .filter(({ result }) => !result.isValid)
        .map(({ domain, result }) => ({
          domain,
          errorType: 'INVALID_RESPONSE' as const,
          message: `${domain}: ${result.errors.join(', ')}`,
          retryable: false,
          timestamp: new Date()
        }));

      if (validDomains.length === 0) {
        await this.stateManager.transitionTo(ApplicationStateType.ERROR);
        this.publishStateChange('error', { request, errors: validationErrors });

        return {
          requestId,
          results: [],
          errors: validationErrors,
          completedAt: new Date(),
          totalExecutionTime: 0
        };
      }

      // Transition to checking state
      await this.stateManager.transitionTo(ApplicationStateType.CHECKING);
      this.publishStateChange('checking', { request, validDomains });

      // Create and execute batch domain check command
      const command = new BatchDomainCheckCommand(
        validDomains,
        this.defaultStrategy
      );

      const startTime = Date.now();
      const commandResult = await this.commandInvoker.execute(command);
      const executionTime = Date.now() - startTime;

      // Extract results from command result
      const batchResult = commandResult.success && commandResult.data ? commandResult.data : null;
      const results = batchResult ? batchResult.results : [];

      // Transition to completed state
      await this.stateManager.transitionTo(ApplicationStateType.COMPLETED);
      this.publishStateChange('completed', { request, results });

      return {
        requestId,
        results,
        errors: validationErrors,
        completedAt: new Date(),
        totalExecutionTime: executionTime
      };

    } catch (error) {
      const queryError: IQueryError = {
        domain: domainNames.join(', '),
        errorType: 'NETWORK' as const,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        retryable: true,
        timestamp: new Date()
      };

      await this.stateManager.transitionTo(ApplicationStateType.ERROR);
      this.publishStateChange('error', { request, error: queryError });

      return {
        requestId,
        results: [],
        errors: [queryError],
        completedAt: new Date(),
        totalExecutionTime: 0
      };
    }
  }

  /**
   * Get current application state
   * @returns Current state information
   */
  getCurrentState(): {
    state: string;
    canTransition: boolean;
    availableTransitions: string[];
  } {
    const currentStateType = this.stateManager.getCurrentStateType();
    return {
      state: currentStateType,
      canTransition: true,
      availableTransitions: ['idle', 'validating', 'checking', 'completed', 'error']
    };
  }

  /**
   * Subscribe to state change events
   * @param callback - Function to call when state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: (event: any) => void): () => void {
    const unsubscribe = this.eventBus.subscribe('stateChange', callback);
    return () => unsubscribe;
  }

  /**
   * Subscribe to domain check progress events
   * @param callback - Function to call on progress updates
   * @returns Unsubscribe function
   */
  onProgress(callback: (event: any) => void): () => void {
    const unsubscribe = this.eventBus.subscribe('progress', callback);
    return () => unsubscribe;
  }

  /**
   * Subscribe to error events
   * @param callback - Function to call on errors
   * @returns Unsubscribe function
   */
  onError(callback: (event: any) => void): () => void {
    const unsubscribe = this.eventBus.subscribe('error', callback);
    return () => unsubscribe;
  }

  /**
   * Get performance metrics for the last operation
   * @returns Performance metrics
   */
  getPerformanceMetrics(): {
    lastExecutionTime: number;
    averageExecutionTime: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
  } {
    // This would be implemented with actual metrics tracking
    // For now, return placeholder metrics
    return {
      lastExecutionTime: 0,
      averageExecutionTime: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0
    };
  }

  /**
   * Reset the controller to idle state
   */
  reset(): void {
    this.stateManager.transitionTo(ApplicationStateType.IDLE);
    this.publishStateChange('reset', {});
  }

  /**
   * Configure query engine timeout
   * @param timeout - Timeout in milliseconds
   */
  setTimeout(timeout: number): void {
    // Configure timeout for the default strategy
    this.defaultStrategy.setConfig({ timeout });
  }

  /**
   * Enable or disable specific query methods
   * @param options - Query method options
   */
  configureQueryMethods(_options: {
    enableDNS?: boolean;
    enableWHOIS?: boolean;
    enableHybrid?: boolean;
  }): void {
    // This would configure which query strategies to use
    // For now, we use the HybridQueryService which includes both DNS and WHOIS
    // In a more complex implementation, we could switch strategies based on options
  }

  /**
   * Set up event listeners for internal state management
   */
  private setupEventListeners(): void {
    // Set up basic event handling
    // Note: CommandInvoker doesn't have onProgress/onError methods in current implementation
    // This would be enhanced when those methods are added
  }

  /**
   * Publish state change events
   * @param state - New state name
   * @param data - Additional event data
   */
  private publishStateChange(state: string, data: any): void {
    this.eventBus.publish('stateChange', {
      state,
      timestamp: new Date(),
      ...data
    });
  }

  /**
   * Generate unique request ID
   * @returns Unique request identifier
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Extract base domain from full domain name
   * @param domain - Full domain name
   * @returns Base domain without TLD
   */
  private extractBaseDomain(domain: string): string {
    const parts = domain.toLowerCase().split('.');
    if (parts.length >= 2) {
      return parts.slice(0, -1).join('.');
    }
    return domain.toLowerCase();
  }

  /**
   * Extract TLD from full domain name
   * @param domain - Full domain name
   * @returns TLD including the dot
   */
  private extractTLD(domain: string): string {
    const parts = domain.toLowerCase().split('.');
    if (parts.length >= 2) {
      return '.' + parts[parts.length - 1];
    }
    return '';
  }

  /**
   * Dispose of resources and clean up
   */
  dispose(): void {
    // Clean up event listeners and reset state only if not already idle
    const currentState = this.stateManager.getCurrentStateType();
    if (currentState !== ApplicationStateType.IDLE) {
      this.stateManager.transitionTo(ApplicationStateType.IDLE);
    }
  }
}