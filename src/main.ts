import { DomainCheckerUI } from './ui/DomainCheckerUI';
import { StatelessManager } from './utils/StatelessManager';

/**
 * Main application entry point
 * Initializes the Domain Availability Checker UI when DOM is ready
 * Ensures stateless operation with no data persistence
 */
class DomainAvailabilityChecker {
  private ui: DomainCheckerUI | null = null;
  private statelessManager: StatelessManager;

  constructor() {
    this.statelessManager = StatelessManager.getInstance();
  }

  /**
   * Initialize the application
   */
  public init(): void {
    // Initialize stateless operation first
    StatelessManager.initialize();
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeUI());
    } else {
      this.initializeUI();
    }
  }

  /**
   * Initialize the UI components
   */
  private initializeUI(): void {
    try {
      // Ensure clean state before initializing UI
      this.statelessManager.ensureCleanState();
      
      this.ui = new DomainCheckerUI();
      console.log('Domain Availability Checker initialized successfully');
      
      // Verify stateless operation
      this.verifyStatelessOperation();
      
    } catch (error) {
      console.error('Failed to initialize Domain Availability Checker:', error);
      this.showFallbackError();
    }
  }

  /**
   * Verify that the application is operating in stateless mode
   */
  private verifyStatelessOperation(): void {
    const verification = this.statelessManager.verifyStatelessOperation();
    const compliance = this.statelessManager.getPrivacyComplianceStatus();
    
    if (!verification.isStateless) {
      console.warn('Stateless operation verification failed:', verification.issues);
    }
    
    if (process.env['NODE_ENV'] === 'development') {
      console.log('Privacy Compliance Status:', compliance);
      console.log('Stateless Verification:', verification);
    }
  }

  /**
   * Show fallback error message if UI initialization fails
   */
  private showFallbackError(): void {
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #e74c3c;">
          <h2>Application Error</h2>
          <p>Failed to initialize the Domain Availability Checker.</p>
          <p>Please refresh the page and try again.</p>
          <p style="font-size: 0.9rem; color: #7f8c8d; margin-top: 1rem;">
            This application operates in privacy mode with no data storage.
          </p>
        </div>
      `;
    }
  }

  /**
   * Dispose of application resources and ensure clean state
   */
  public dispose(): void {
    if (this.ui) {
      this.ui.dispose();
      this.ui = null;
    }
    
    // Ensure clean state on disposal
    this.statelessManager.ensureCleanState();
  }

  /**
   * Reset application to clean state
   */
  public reset(): void {
    if (this.ui) {
      this.ui.reset();
    }
    this.statelessManager.ensureCleanState();
  }

  /**
   * Get privacy compliance information
   */
  public getPrivacyInfo(): {
    compliant: boolean;
    features: string[];
    verification: any;
  } {
    const compliance = this.statelessManager.getPrivacyComplianceStatus();
    const verification = this.statelessManager.verifyStatelessOperation();
    
    const features = [
      'No data persistence or storage',
      'No user tracking or analytics',
      'No session storage usage',
      'No cookies for user data',
      'Clean state on page refresh',
      'Privacy-focused design'
    ];
    
    return {
      compliant: compliance.compliant,
      features,
      verification
    };
  }
}

// Initialize the application
const app = new DomainAvailabilityChecker();
app.init();

// Handle page unload
window.addEventListener('beforeunload', () => {
  app.dispose();
});

// Export for potential external use
export { DomainAvailabilityChecker };