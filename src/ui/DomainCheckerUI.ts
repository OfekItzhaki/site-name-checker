import { DomainController } from '../controllers/DomainController';
import { AvailabilityStatus } from '../models/AvailabilityStatus';
import type { IDomainResult, IQueryResponse } from '../models';

/**
 * UI Controller for Domain Availability Checker
 * Handles user interactions and DOM manipulation with strict separation from business logic
 * Only contains presentation logic - all business logic is delegated to DomainController
 */
export class DomainCheckerUI {
  private domainController: DomainController;
  private domainForm!: HTMLFormElement;
  private domainInput!: HTMLInputElement;
  private checkButton!: HTMLButtonElement;
  private validationError!: HTMLElement;
  private resultsSection!: HTMLElement;
  private progressIndicator!: HTMLElement;
  private progressFill!: HTMLElement;
  private progressText!: HTMLElement;
  private resultsGrid!: HTMLElement;
  private errorMessage!: HTMLElement;
  private retryButton!: HTMLButtonElement;

  private currentResults: IDomainResult[] = [];
  private failedDomains: string[] = [];
  private retryAttempts: Map<string, number> = new Map();
  private maxRetryAttempts: number = 3;
  private baseRetryDelay: number = 1000; // 1 second

  constructor() {
    this.domainController = new DomainController();
    this.initializeElements();
    this.setupEventListeners();
    this.setupControllerCallbacks();
  }

  /**
   * Initialize DOM elements with proper error handling
   */
  private initializeElements(): void {
    // Form elements
    this.domainForm = this.getElement('#domain-form') as HTMLFormElement;
    this.domainInput = this.getElement('#domain-input') as HTMLInputElement;
    this.checkButton = this.getElement('#check-button') as HTMLButtonElement;
    this.validationError = this.getElement('#validation-error');

    // Results elements
    this.resultsSection = this.getElement('#results-section');
    this.progressIndicator = this.getElement('#progress-indicator');
    this.progressFill = this.getElement('#progress-fill');
    this.progressText = this.getElement('#progress-text');
    this.resultsGrid = this.getElement('#results-grid');
    this.errorMessage = this.getElement('#error-message');
    this.retryButton = this.getElement('#retry-button') as HTMLButtonElement;
  }

  /**
   * Get DOM element with error handling
   */
  private getElement(selector: string): HTMLElement {
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element;
  }

  /**
   * Set up UI event listeners
   */
  private setupEventListeners(): void {
    // Form submission
    this.domainForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleDomainCheck();
    });

    // Input validation on typing
    this.domainInput.addEventListener('input', () => {
      this.clearValidationError();
    });

    // Retry button
    this.retryButton.addEventListener('click', () => {
      this.handleRetry();
    });

    // Enter key support
    this.domainInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleDomainCheck();
      }
    });
  }

  /**
   * Set up callbacks from domain controller
   */
  private setupControllerCallbacks(): void {
    // State change events
    this.domainController.onStateChange((event) => {
      this.handleStateChange(event.state, event);
    });

    // Progress events
    this.domainController.onProgress((event) => {
      this.handleProgress(event);
    });

    // Error events
    this.domainController.onError((event) => {
      this.handleControllerError(event);
    });
  }

  /**
   * Handle domain availability check
   */
  private async handleDomainCheck(): Promise<void> {
    const domainInput = this.domainInput.value.trim();
    
    if (!domainInput) {
      this.showValidationError('Please enter a domain name');
      return;
    }

    // Clear previous results
    this.clearResults();
    this.clearValidationError();
    
    // Generate domains for all supported TLDs
    const tlds = ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'];
    const domains = tlds.map(tld => domainInput + tld);

    try {
      // Set loading state
      this.setLoadingState(true);
      this.showResults();
      this.showProgress('Checking domains...', 0);

      // Create placeholder results
      this.createPlaceholderResults(domains);

      // Check domains using controller
      const response = await this.domainController.checkDomains(domains);
      
      // Process results
      this.processQueryResponse(response);
      
    } catch (error) {
      this.handleError('An unexpected error occurred. Please try again.');
      console.error('Domain check error:', error);
    } finally {
      this.setLoadingState(false);
      this.hideProgress();
    }
  }

  /**
   * Handle retry for failed domains with exponential backoff
   */
  private async handleRetry(): Promise<void> {
    if (this.failedDomains.length === 0) {
      return;
    }

    // Filter domains that haven't exceeded max retry attempts
    const domainsToRetry = this.failedDomains.filter(domain => {
      const attempts = this.retryAttempts.get(domain) || 0;
      return attempts < this.maxRetryAttempts;
    });

    if (domainsToRetry.length === 0) {
      this.showError('All failed domains have reached maximum retry attempts.');
      this.hideRetryButton();
      return;
    }

    try {
      this.setLoadingState(true);
      this.showProgress('Retrying failed domains...', 0);
      
      // Update retry attempts and show retrying state
      domainsToRetry.forEach(domain => {
        const attempts = this.retryAttempts.get(domain) || 0;
        this.retryAttempts.set(domain, attempts + 1);
        this.updateDomainResult(domain, AvailabilityStatus.ERROR, `Retrying... (${attempts + 1}/${this.maxRetryAttempts})`);
      });

      // Calculate delay based on retry attempts (exponential backoff)
      const maxAttempts = Math.max(...domainsToRetry.map(d => this.retryAttempts.get(d) || 0));
      const delay = this.baseRetryDelay * Math.pow(2, maxAttempts - 1);
      
      if (delay > this.baseRetryDelay) {
        this.showProgress(`Waiting ${Math.round(delay / 1000)}s before retry...`, 0);
        await this.sleep(delay);
      }

      const response = await this.domainController.checkDomains(domainsToRetry);
      this.processQueryResponse(response);
      
    } catch (error) {
      this.handleError('Retry failed. Please try again.');
      console.error('Retry error:', error);
    } finally {
      this.setLoadingState(false);
      this.hideProgress();
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process query response from controller with enhanced error handling
   */
  private processQueryResponse(response: IQueryResponse): void {
    // Update successful results
    response.results.forEach(result => {
      this.updateDomainResult(result.domain, result.status, this.getStatusText(result.status));
      
      // Update current results
      const existingIndex = this.currentResults.findIndex(r => r.domain === result.domain);
      if (existingIndex >= 0) {
        this.currentResults[existingIndex] = result;
      } else {
        this.currentResults.push(result);
      }

      // Remove from failed domains if successful
      const failedIndex = this.failedDomains.indexOf(result.domain);
      if (failedIndex >= 0) {
        this.failedDomains.splice(failedIndex, 1);
      }
    });

    // Handle errors with detailed feedback
    if (response.errors.length > 0) {
      response.errors.forEach(error => {
        const attempts = this.retryAttempts.get(error.domain) || 0;
        const canRetry = attempts < this.maxRetryAttempts;
        
        let statusText = this.getDetailedErrorMessage(error.message, attempts, canRetry);
        this.updateDomainResult(error.domain, AvailabilityStatus.ERROR, statusText);
        
        // Add to failed domains if not already there and can retry
        if (canRetry && !this.failedDomains.includes(error.domain)) {
          this.failedDomains.push(error.domain);
        }
      });
      
      // Show retry button only if there are retryable domains
      const retryableDomains = this.failedDomains.filter(domain => {
        const attempts = this.retryAttempts.get(domain) || 0;
        return attempts < this.maxRetryAttempts;
      });

      if (retryableDomains.length > 0) {
        this.showRetryButton();
        this.updateRetryButtonText(retryableDomains.length);
      } else {
        this.hideRetryButton();
      }
    } else {
      this.hideRetryButton();
    }

    // Show enhanced summary
    this.showResultsSummary(response);
  }

  /**
   * Get detailed error message based on error type and retry attempts
   */
  private getDetailedErrorMessage(errorMessage: string, attempts: number, canRetry: boolean): string {
    const baseMessage = this.categorizeError(errorMessage);
    
    if (attempts > 0) {
      if (canRetry) {
        return `${baseMessage} (Attempt ${attempts + 1}/${this.maxRetryAttempts})`;
      } else {
        return `${baseMessage} (Max retries reached)`;
      }
    }
    
    return baseMessage;
  }

  /**
   * Categorize error messages for better user understanding
   */
  private categorizeError(errorMessage: string): string {
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return 'Request timeout';
    } else if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return 'Network error';
    } else if (lowerMessage.includes('dns')) {
      return 'DNS lookup failed';
    } else if (lowerMessage.includes('whois')) {
      return 'WHOIS query failed';
    } else if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
      return 'Rate limited';
    } else {
      return 'Check failed';
    }
  }

  /**
   * Update retry button text with count
   */
  private updateRetryButtonText(retryableCount: number): void {
    this.retryButton.textContent = `Retry Failed Checks (${retryableCount})`;
  }

  /**
   * Show enhanced results summary
   */
  private showResultsSummary(response: IQueryResponse): void {
    const successCount = response.results.length;
    const errorCount = response.errors.length;
    
    if (errorCount > 0) {
      const retryableCount = this.failedDomains.filter(domain => {
        const attempts = this.retryAttempts.get(domain) || 0;
        return attempts < this.maxRetryAttempts;
      }).length;
      
      let message = `${successCount} domains checked successfully, ${errorCount} failed.`;
      
      if (retryableCount > 0) {
        message += ` ${retryableCount} domains can be retried.`;
      }
      
      if (errorCount > retryableCount) {
        const maxRetriedCount = errorCount - retryableCount;
        message += ` ${maxRetriedCount} domains reached maximum retry attempts.`;
      }
      
      this.showError(message);
    } else if (successCount > 0) {
      this.showSuccess(`All ${successCount} domains checked successfully!`);
    }
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.className = 'success-message';
    this.errorMessage.classList.remove('hidden');
  }

  /**
   * Create placeholder results while checking with enhanced loading indicators
   */
  private createPlaceholderResults(domains: string[]): void {
    this.resultsGrid.innerHTML = '';
    
    domains.forEach((domain, index) => {
      const resultElement = this.createResultElement(domain, AvailabilityStatus.ERROR, 'Checking...');
      resultElement.classList.add('checking');
      
      // Add loading spinner to each domain
      const statusElement = resultElement.querySelector('.status') as HTMLElement;
      if (statusElement) {
        statusElement.innerHTML = '<span class="loading-spinner"></span>Checking...';
      }
      
      // Stagger the appearance for visual effect
      setTimeout(() => {
        this.resultsGrid.appendChild(resultElement);
      }, index * 100);
    });
  }

  /**
   * Update individual domain result with smooth transitions
   */
  private updateDomainResult(domain: string, status: AvailabilityStatus, statusText: string): void {
    const existingElement = this.resultsGrid.querySelector(`[data-domain="${domain}"]`) as HTMLElement;
    
    if (existingElement) {
      // Add transition class
      existingElement.classList.add('updating');
      
      setTimeout(() => {
        // Update existing element
        existingElement.className = `result-item ${this.getStatusClass(status)}`;
        
        const statusElement = existingElement.querySelector('.status') as HTMLElement;
        if (statusElement) {
          statusElement.textContent = statusText;
          statusElement.className = `status ${this.getStatusClass(status)}`;
        }
        
        // Remove transition class
        existingElement.classList.remove('updating');
        
        // Add completion animation for successful results
        if (status !== AvailabilityStatus.ERROR) {
          existingElement.classList.add('completed');
          setTimeout(() => {
            existingElement.classList.remove('completed');
          }, 600);
        }
      }, 150);
    } else {
      // Create new element
      const resultElement = this.createResultElement(domain, status, statusText);
      this.resultsGrid.appendChild(resultElement);
    }
  }

  /**
   * Create result element for a domain
   */
  private createResultElement(domain: string, status: AvailabilityStatus, statusText: string): HTMLElement {
    const resultItem = document.createElement('div');
    resultItem.className = `result-item ${this.getStatusClass(status)}`;
    resultItem.setAttribute('data-domain', domain);
    
    resultItem.innerHTML = `
      <span class="domain-name">${domain}</span>
      <span class="status ${this.getStatusClass(status)}">${statusText}</span>
    `;
    
    return resultItem;
  }

  /**
   * Get CSS class for status
   */
  private getStatusClass(status: AvailabilityStatus): string {
    switch (status) {
      case AvailabilityStatus.AVAILABLE:
        return 'available';
      case AvailabilityStatus.TAKEN:
        return 'taken';
      case AvailabilityStatus.ERROR:
        return 'error';
      default:
        return 'checking';
    }
  }

  /**
   * Get display text for status
   */
  private getStatusText(status: AvailabilityStatus): string {
    switch (status) {
      case AvailabilityStatus.AVAILABLE:
        return 'Available';
      case AvailabilityStatus.TAKEN:
        return 'Taken';
      case AvailabilityStatus.ERROR:
        return 'Error';
      default:
        return 'Checking...';
    }
  }

  /**
   * Handle state changes from controller
   */
  private handleStateChange(state: string, event: any): void {
    switch (state) {
      case 'validating':
        this.showProgress('Validating input...', 10);
        break;
      case 'checking':
        this.showProgress('Checking domains...', 30);
        break;
      case 'completed':
        this.showProgress('Complete', 100);
        break;
      case 'error':
        this.hideProgress();
        if (event.error) {
          this.handleError(event.error.message || 'An error occurred');
        }
        break;
    }
  }

  /**
   * Handle progress updates
   */
  private handleProgress(event: any): void {
    if (event.progress && typeof event.progress.completed === 'number' && typeof event.progress.total === 'number') {
      const percentage = (event.progress.completed / event.progress.total) * 100;
      this.showProgress(`Checking domains... (${event.progress.completed}/${event.progress.total})`, percentage);
    }
  }

  /**
   * Handle controller errors
   */
  private handleControllerError(event: any): void {
    const message = event.error?.message || 'An unexpected error occurred';
    this.handleError(message);
  }

  /**
   * Show validation error
   */
  private showValidationError(message: string): void {
    this.validationError.textContent = message;
    this.validationError.classList.remove('hidden');
  }

  /**
   * Clear validation error
   */
  private clearValidationError(): void {
    this.validationError.classList.add('hidden');
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
  }

  /**
   * Handle general errors
   */
  private handleError(message: string): void {
    this.showError(message);
    this.setLoadingState(false);
    this.hideProgress();
  }

  /**
   * Show progress indicator with enhanced feedback
   */
  private showProgress(text: string, percentage: number): void {
    this.progressText.textContent = text;
    const clampedPercentage = Math.min(100, Math.max(0, percentage));
    this.progressFill.style.width = `${clampedPercentage}%`;
    
    // Add progress color based on percentage
    if (clampedPercentage < 30) {
      this.progressFill.style.backgroundColor = '#e74c3c';
    } else if (clampedPercentage < 70) {
      this.progressFill.style.backgroundColor = '#f39c12';
    } else {
      this.progressFill.style.backgroundColor = '#27ae60';
    }
    
    this.progressIndicator.classList.remove('hidden');
    
    // Add pulse animation for active progress
    if (clampedPercentage > 0 && clampedPercentage < 100) {
      this.progressIndicator.classList.add('active');
    } else {
      this.progressIndicator.classList.remove('active');
    }
  }

  /**
   * Hide progress indicator
   */
  private hideProgress(): void {
    this.progressIndicator.classList.add('hidden');
  }

  /**
   * Show results section
   */
  private showResults(): void {
    this.resultsSection.classList.remove('hidden');
  }

  /**
   * Clear all results and reset retry state
   */
  private clearResults(): void {
    this.resultsGrid.innerHTML = '';
    this.errorMessage.classList.add('hidden');
    this.currentResults = [];
    this.failedDomains = [];
    this.retryAttempts.clear();
    this.hideRetryButton();
  }

  /**
   * Show retry button
   */
  private showRetryButton(): void {
    this.retryButton.classList.remove('hidden');
  }

  /**
   * Hide retry button
   */
  private hideRetryButton(): void {
    this.retryButton.classList.add('hidden');
  }

  /**
   * Set loading state for UI elements
   */
  private setLoadingState(loading: boolean): void {
    this.checkButton.disabled = loading;
    this.domainInput.disabled = loading;
    this.retryButton.disabled = loading;
    
    if (loading) {
      this.checkButton.textContent = 'Checking...';
      this.domainForm.classList.add('loading');
    } else {
      this.checkButton.textContent = 'Check Availability';
      this.domainForm.classList.remove('loading');
    }
  }

  /**
   * Get current results for external access
   */
  public getCurrentResults(): IDomainResult[] {
    return [...this.currentResults];
  }

  /**
   * Reset the UI to initial state
   */
  public reset(): void {
    this.domainInput.value = '';
    this.clearValidationError();
    this.clearResults();
    this.resultsSection.classList.add('hidden');
    this.setLoadingState(false);
    this.domainController.reset();
  }

  /**
   * Dispose of resources and clean up
   */
  public dispose(): void {
    this.domainController.dispose();
  }
}