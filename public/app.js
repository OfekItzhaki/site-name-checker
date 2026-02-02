/**
 * Domain Availability Checker - Frontend Client
 * Browser-compatible application that communicates with the Node.js API
 */
class DomainCheckerClient {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3001/api';
    this.currentResults = [];
    this.failedDomains = [];
    this.retryAttempts = new Map();
    this.maxRetryAttempts = 3;
    
    this.initializeElements();
    this.setupEventListeners();
    this.checkApiHealth();
  }

  initializeElements() {
    // Form elements
    this.domainForm = document.getElementById('domain-form');
    this.domainInput = document.getElementById('domain-input');
    this.checkButton = document.getElementById('check-button');
    this.validationError = document.getElementById('validation-error');

    // Results elements
    this.resultsSection = document.getElementById('results-section');
    this.progressIndicator = document.getElementById('progress-indicator');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');
    this.resultsGrid = document.getElementById('results-grid');
    this.errorMessage = document.getElementById('error-message');
    this.retryButton = document.getElementById('retry-button');

    // API status indicator
    this.createApiStatusIndicator();
  }

  createApiStatusIndicator() {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'api-status';
    statusDiv.className = 'api-status checking';
    statusDiv.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">Connecting to API...</span>
    `;
    document.querySelector('.header').appendChild(statusDiv);
    this.apiStatus = statusDiv;
  }

  setupEventListeners() {
    this.domainForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    this.retryButton.addEventListener('click', () => {
      this.handleRetry();
    });

    // Real-time validation
    this.domainInput.addEventListener('input', () => {
      this.hideValidationError();
    });
  }

  async checkApiHealth() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`);
      const health = await response.json();
      
      if (health.status === 'healthy') {
        this.updateApiStatus('connected', 'API Connected');
      } else {
        this.updateApiStatus('error', 'API Error');
      }
    } catch (error) {
      console.error('API health check failed:', error);
      this.updateApiStatus('error', 'API Offline');
    }
  }

  updateApiStatus(status, message) {
    this.apiStatus.className = `api-status ${status}`;
    this.apiStatus.querySelector('.status-text').textContent = message;
  }

  async handleSubmit() {
    const domain = this.domainInput.value.trim();
    
    if (!domain) {
      this.showValidationError('Please enter a domain name');
      return;
    }

    // Client-side validation first
    if (!this.isValidDomainFormat(domain)) {
      this.showValidationError('Please enter a valid domain name (letters, numbers, and hyphens only)');
      return;
    }

    this.hideValidationError();
    this.showProgress();

    try {
      // Validate with API
      const validationResponse = await fetch(`${this.apiBaseUrl}/validate-domain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain })
      });

      const validation = await validationResponse.json();
      
      if (!validation.isValid) {
        this.hideProgress();
        this.showValidationError(validation.message || 'Invalid domain format');
        return;
      }

      // Check domain availability
      await this.checkDomainAvailability(domain);
      
    } catch (error) {
      console.error('Domain check failed:', error);
      this.hideProgress();
      this.showError('Failed to check domain availability. Please check your connection and try again.');
    }
  }

  async checkDomainAvailability(baseDomain) {
    try {
      this.updateProgress(10, 'Preparing domain check...');

      const request = {
        baseDomain,
        tlds: ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'],
        options: {
          concurrent: true,
          timeout: 10000,
          retries: 2
        }
      };

      this.updateProgress(20, 'Sending request to API...');

      const response = await fetch(`${this.apiBaseUrl}/check-domain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      this.updateProgress(50, 'Processing results...');

      const result = await response.json();
      
      this.updateProgress(100, 'Complete!');
      
      setTimeout(() => {
        this.hideProgress();
        this.displayResults(result);
      }, 500);

    } catch (error) {
      console.error('API request failed:', error);
      this.hideProgress();
      this.showError('Failed to check domain availability. Please try again.');
    }
  }

  isValidDomainFormat(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    return domainRegex.test(domain) && domain.length <= 63;
  }

  showProgress() {
    this.resultsSection.classList.remove('hidden');
    this.progressIndicator.classList.remove('hidden');
    this.resultsGrid.innerHTML = '';
    this.errorMessage.classList.add('hidden');
    this.retryButton.classList.add('hidden');
  }

  updateProgress(percentage, text) {
    this.progressFill.style.width = percentage + '%';
    this.progressText.textContent = text;
  }

  hideProgress() {
    this.progressIndicator.classList.add('hidden');
  }

  displayResults(response) {
    this.currentResults = response.results || [];
    this.resultsGrid.innerHTML = '';
    
    if (this.currentResults.length === 0) {
      this.showError('No results received from the API');
      return;
    }

    // Display summary
    const summary = this.createSummary(response);
    this.resultsGrid.appendChild(summary);

    // Display individual results
    this.currentResults.forEach(result => {
      const resultCard = this.createResultCard(result);
      this.resultsGrid.appendChild(resultCard);
    });

    // Show retry button if there are errors
    const hasErrors = this.currentResults.some(r => r.status === 'error');
    if (hasErrors) {
      this.retryButton.classList.remove('hidden');
    }
  }

  createSummary(response) {
    const summary = document.createElement('div');
    summary.className = 'results-summary';
    
    const available = this.currentResults.filter(r => r.status === 'available').length;
    const taken = this.currentResults.filter(r => r.status === 'taken').length;
    const errors = this.currentResults.filter(r => r.status === 'error').length;
    
    summary.innerHTML = `
      <h3>Summary for "${response.baseDomain || 'domain'}"</h3>
      <div class="summary-stats">
        <span class="stat available">✅ ${available} Available</span>
        <span class="stat taken">❌ ${taken} Taken</span>
        ${errors > 0 ? `<span class="stat error">⚠️ ${errors} Errors</span>` : ''}
      </div>
      <div class="summary-time">
        Completed in ${response.executionTime || 0}ms
      </div>
    `;
    
    return summary;
  }

  createResultCard(result) {
    const resultCard = document.createElement('div');
    resultCard.className = `result-card ${result.status}`;
    
    const statusIcon = this.getStatusIcon(result.status);
    const statusText = this.getStatusText(result.status);
    const statusClass = result.status;
    
    // Build pricing information HTML
    let pricingHtml = '';
    if (result.status === 'available' && result.pricing) {
      const pricing = result.pricing;
      pricingHtml = `
        <div class="pricing-info">
          <div class="price-main">
            <span class="price-label">First Year:</span>
            <span class="price-value ${pricing.isPremium ? 'premium' : ''}">$${pricing.firstYearPrice}</span>
          </div>
          <div class="price-renewal">
            <span class="price-label">Renewal:</span>
            <span class="price-value">$${pricing.renewalPrice}/year</span>
          </div>
          <div class="registrar-info">
            <span class="registrar-label">Best Price:</span>
            <a href="${pricing.registrarUrl}" target="_blank" class="registrar-link">${pricing.registrar}</a>
          </div>
          ${pricing.isPremium ? '<div class="premium-badge">Premium TLD</div>' : ''}
          ${pricing.notes ? `<div class="pricing-notes">${pricing.notes}</div>` : ''}
        </div>
      `;
    }
    
    resultCard.innerHTML = `
      <div class="domain-name">${result.domain}</div>
      <div class="status ${statusClass}">
        <span class="status-icon">${statusIcon}</span>
        <span class="status-text">${statusText}</span>
      </div>
      <div class="details">
        <span class="method">${result.checkMethod || 'API'}</span>
        <span class="time">${result.executionTime || 0}ms</span>
      </div>
      ${pricingHtml}
      ${result.error ? `<div class="error-details">${result.error}</div>` : ''}
    `;
    
    return resultCard;
  }

  getStatusIcon(status) {
    switch (status) {
      case 'available': return '✅';
      case 'taken': return '❌';
      case 'error': return '⚠️';
      case 'checking': return '🔄';
      default: return '❓';
    }
  }

  getStatusText(status) {
    switch (status) {
      case 'available': return 'Available';
      case 'taken': return 'Taken';
      case 'error': return 'Error';
      case 'checking': return 'Checking';
      default: return 'Unknown';
    }
  }

  showValidationError(message) {
    this.validationError.textContent = message;
    this.validationError.classList.remove('hidden');
  }

  hideValidationError() {
    this.validationError.classList.add('hidden');
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
  }

  hideError() {
    this.errorMessage.classList.add('hidden');
  }

  handleRetry() {
    const domain = this.domainInput.value.trim();
    if (domain) {
      this.handleSubmit();
    }
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.domainChecker = new DomainCheckerClient();
  console.log('Domain Availability Checker Client initialized successfully');
});