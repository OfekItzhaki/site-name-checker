import { DomainController } from '../../src/controllers/DomainController';
import { StatelessManager } from '../../src/utils/StatelessManager';

/**
 * End-to-End Integration Tests
 * 
 * These tests validate complete workflows from user input to final results,
 * ensuring all components work together correctly in realistic scenarios.
 */
describe('End-to-End Integration Tests', () => {
  let controller: DomainController;
  let statelessManager: StatelessManager;

  beforeEach(() => {
    // Initialize all components as they would be in the real application
    controller = new DomainController();
    statelessManager = StatelessManager.getInstance();

    // Ensure clean state before each test
    statelessManager.ensureCleanState();
  });

  afterEach(() => {
    // Clean up after each test
    controller.dispose();
    statelessManager.ensureCleanState();
  });

  /**
   * Test complete single domain checking workflow
   * Validates: All requirements - complete user journey
   */
  describe('Single Domain Checking Workflow', () => {
    test('should complete full workflow for valid domain input', async () => {
      // Arrange
      const testDomain = 'test-domain-12345';
      const stateChanges: string[] = [];
      const progressEvents: any[] = [];

      // Subscribe to events to track workflow progress
      const unsubscribeState = controller.onStateChange((event) => {
        stateChanges.push(event.state);
      });

      const unsubscribeProgress = controller.onProgress((event) => {
        progressEvents.push(event);
      });

      try {
        // Act - Execute complete domain check
        const response = await controller.checkDomain(testDomain);

        // Assert - Verify response structure
        expect(response).toBeDefined();
        expect(response.requestId).toBeDefined();
        expect(response.results).toBeDefined();
        expect(Array.isArray(response.results)).toBe(true);
        expect(response.results.length).toBeGreaterThan(0);

        // Verify all TLDs were checked
        const expectedTlds = ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'];
        const checkedTlds = response.results.map(result => result.tld);
        expectedTlds.forEach(tld => {
          expect(checkedTlds).toContain(tld);
        });

        // Verify state transitions occurred
        expect(stateChanges.length).toBeGreaterThan(0);
        expect(stateChanges).toContain('validating');
        expect(stateChanges).toContain('checking');

        // Verify each result has required properties
        response.results.forEach(result => {
          expect(result.domain).toBeDefined();
          expect(result.status).toBeDefined();
          expect(['available', 'taken', 'error'].includes(result.status)).toBe(true);
          expect(result.lastChecked).toBeDefined();
          expect(result.executionTime).toBeDefined();
          expect(typeof result.executionTime).toBe('number');
        });

        // Verify stateless operation
        expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);

      } finally {
        // Clean up subscriptions
        unsubscribeState();
        unsubscribeProgress();
      }
    }, 15000); // Increased timeout for network operations

    test('should handle invalid domain input gracefully', async () => {
      // Arrange
      const invalidDomain = 'invalid@domain.com';

      // Act
      const response = await controller.checkDomain(invalidDomain);

      // Assert - Should return error response
      expect(response.errors).toBeDefined();
      expect(response.errors.length).toBeGreaterThan(0);
      if (response.errors.length > 0) {
        expect(response.errors[0]?.message).toContain('letters, numbers, and hyphens');
      }

      // Verify stateless operation maintained
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);
    });
  });

  /**
   * Test batch domain checking workflow
   * Validates: Concurrent processing and error isolation
   */
  describe('Batch Domain Checking Workflow', () => {
    test('should process multiple domains concurrently', async () => {
      // Arrange
      const testDomains = [
        'test-domain-1.com',
        'test-domain-2.net', 
        'test-domain-3.org'
      ];
      const progressEvents: any[] = [];

      const unsubscribeProgress = controller.onProgress((event) => {
        progressEvents.push(event);
      });

      try {
        // Act
        const startTime = Date.now();
        const response = await controller.checkDomains(testDomains);
        const endTime = Date.now();

        // Assert - Verify concurrent processing efficiency
        const totalTime = endTime - startTime;
        const expectedSequentialTime = testDomains.length * 7 * 2000; // 7 TLDs * 2s timeout per domain
        expect(totalTime).toBeLessThan(expectedSequentialTime * 0.5); // Should be much faster than sequential

        // Verify response structure
        expect(response.requestId).toBeDefined();
        expect(response.results).toBeDefined();
        expect(response.results.length).toBe(testDomains.length); // 3 specific domains

        // Verify all domains were processed
        testDomains.forEach(domain => {
          const domainResults = response.results.filter(result => 
            result.domain === domain
          );
          expect(domainResults.length).toBe(1); // One result per specific domain
        });

      } finally {
        unsubscribeProgress();
      }
    }, 20000);

    test('should isolate errors and continue processing other domains', async () => {
      // Arrange - Mix of valid and invalid domains
      const mixedDomains = [
        'valid-domain.com',
        'invalid@domain.net',
        'another-valid-domain.org',
        '', // Empty domain
        'third-valid-domain.ai'
      ];

      // Act
      const response = await controller.checkDomains(mixedDomains);

      // Assert - Should process valid domains despite invalid ones
      expect(response).toBeDefined();
      
      // Should have results for valid domains
      const validDomainResults = response.results.filter(result => 
        result.domain === 'valid-domain.com' || 
        result.domain === 'another-valid-domain.org' || 
        result.domain === 'third-valid-domain.ai'
      );
      expect(validDomainResults.length).toBeGreaterThan(0);

      // Should have error information for invalid domains
      if (response.errors && response.errors.length > 0) {
        expect(response.errors[0]?.message).toBeDefined();
      }

      // Verify stateless operation maintained
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);
    }, 15000);
  });

  /**
   * Test error recovery and retry scenarios
   * Validates: Error handling and resilience
   */
  describe('Error Recovery and Retry Scenarios', () => {
    test('should handle network timeouts gracefully', async () => {
      // Arrange
      const testDomain = 'timeout-test-domain';

      // Act - This may timeout on some TLDs but should still return results
      const response = await controller.checkDomain(testDomain);

      // Assert - Should handle timeouts gracefully
      expect(response).toBeDefined();
      expect(response.results).toBeDefined();

      // Some results may have errors, but system should remain stable
      // Should have attempted all TLDs
      expect(response.results.length).toBe(7);

      // Even if some fail, system should remain in valid state
      const currentState = controller.getCurrentState();
      expect(currentState.state).toBeDefined();
      expect(typeof currentState.canTransition).toBe('boolean');

      // Verify stateless operation
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);
    }, 20000);
  });

  /**
   * Test state management throughout workflows
   * Validates: State pattern implementation and transitions
   */
  describe('State Management Integration', () => {
    test('should maintain consistent state throughout domain checking', async () => {
      // Arrange
      const testDomain = 'state-test-domain';
      const stateHistory: string[] = [];

      const unsubscribe = controller.onStateChange((event) => {
        stateHistory.push(event.state);
      });

      try {
        // Act
        const initialState = controller.getCurrentState();
        expect(initialState.state).toBe('idle');

        await controller.checkDomain(testDomain);

        // Assert - Verify state progression
        expect(stateHistory.length).toBeGreaterThan(0);
        
        // Should have gone through validation and checking states
        expect(stateHistory).toContain('validating');
        expect(stateHistory).toContain('checking');

        // Final state should be completed or error
        const finalState = controller.getCurrentState();
        expect(['completed', 'error'].includes(finalState.state)).toBe(true);

        // Verify state consistency
        expect(finalState.canTransition).toBeDefined();
        expect(Array.isArray(finalState.availableTransitions)).toBe(true);

      } finally {
        unsubscribe();
      }
    });
  });

  /**
   * Test privacy and stateless operation compliance
   * Validates: Privacy requirements and stateless design
   */
  describe('Privacy and Stateless Operation Compliance', () => {
    test('should maintain privacy throughout complete workflow', async () => {
      // Arrange
      const sensitiveTestDomain = 'private-company-domain';

      // Verify clean state before
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);

      // Act - Complete domain check workflow
      const response = await controller.checkDomain(sensitiveTestDomain);

      // Assert - Verify no data persistence
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);

      // Verify no sensitive data in browser storage
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);

      // Verify no cookies were set
      expect(document.cookie).toBe('');

      // Verify response doesn't contain sensitive system information
      expect(response).toBeDefined();
      response.results.forEach(result => {
        // Should not expose internal system details
        expect(result.domain).not.toContain('localhost');
        expect(result.domain).not.toContain('127.0.0.1');
        
        // Should not expose API keys or sensitive configuration
        if (result.dnsRecords) {
          expect(JSON.stringify(result.dnsRecords)).not.toMatch(/key|token|secret|password/i);
        }
        if (result.whoisData) {
          expect(JSON.stringify(result.whoisData)).not.toMatch(/key|token|secret|password/i);
        }
      });
    });

    test('should work without any authentication', async () => {
      // Arrange - Ensure no authentication tokens or sessions
      statelessManager.ensureCleanState();
      
      // Act - Should work without any authentication
      const response = await controller.checkDomain('no-auth-test');

      // Assert - Should complete successfully
      expect(response).toBeDefined();
      expect(response.results).toBeDefined();

      // Verify no authentication was required or stored
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);
    });
  });
});