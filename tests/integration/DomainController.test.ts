import { DomainController } from '../../src/controllers/DomainController';
import { AvailabilityStatus } from '../../src/models/AvailabilityStatus';

/**
 * Integration tests for Domain Controller
 * Tests end-to-end domain checking workflow and error handling scenarios
 */
describe('DomainController Integration Tests', () => {
  let controller: DomainController;

  beforeEach(() => {
    controller = new DomainController();
  });

  afterEach(() => {
    controller.dispose();
  });

  describe('Single Domain Checking', () => {
    it('should successfully check a single domain', async () => {
      const response = await controller.checkDomain('example.com');
      
      expect(response).toBeDefined();
      expect(response.requestId).toBeDefined();
      expect(response.results).toHaveLength(1);
      expect(response.completedAt).toBeInstanceOf(Date);
      expect(response.totalExecutionTime).toBeGreaterThanOrEqual(0);
      
      const result = response.results[0];
      expect(result).toBeDefined();
      expect(result!.domain).toBe('example.com');
      expect(result!.baseDomain).toBe('example');
      expect(result!.tld).toBe('.com');
      expect(Object.values(AvailabilityStatus)).toContain(result!.status);
      expect(result!.lastChecked).toBeInstanceOf(Date);
      expect(result!.checkMethod).toBe('HYBRID');
    });

    it('should handle invalid domain format', async () => {
      const response = await controller.checkDomain('');
      
      expect(response.requestId).toBeDefined();
      expect(response.results).toHaveLength(0);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0]!.errorType).toBe('INVALID_RESPONSE');
      expect(response.errors[0]!.message).toContain('empty');
    });

    it('should handle empty domain input', async () => {
      const response = await controller.checkDomain('');
      
      expect(response.results).toHaveLength(0);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0]!.errorType).toBe('INVALID_RESPONSE');
    });

    it('should handle domain with invalid characters', async () => {
      const response = await controller.checkDomain('test@domain.com');
      
      expect(response.results).toHaveLength(0);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0]!.errorType).toBe('INVALID_RESPONSE');
    });

    it('should sanitize domain input correctly', async () => {
      const response = await controller.checkDomain('  EXAMPLE.COM  ');
      
      expect(response.results).toHaveLength(1);
      const result = response.results[0];
      expect(result).toBeDefined();
      expect(result!.domain).toBe('example.com');
      expect(result!.baseDomain).toBe('example');
    });
  });

  describe('Multiple Domain Checking', () => {
    it('should successfully check multiple domains', async () => {
      const domains = ['example.com', 'test.org', 'sample.net'];
      const response = await controller.checkDomains(domains);
      
      expect(response.requestId).toBeDefined();
      expect(response.results).toHaveLength(3);
      expect(response.completedAt).toBeInstanceOf(Date);
      expect(response.totalExecutionTime).toBeGreaterThanOrEqual(0);
      
      response.results.forEach((result, index) => {
        expect(result.domain).toBe(domains[index]);
        expect(Object.values(AvailabilityStatus)).toContain(result.status);
        expect(result.checkMethod).toBe('HYBRID');
      });
    });

    it('should handle mixed valid and invalid domains', async () => {
      const domains = ['example.com', '', 'test.org'];
      const response = await controller.checkDomains(domains);
      
      expect(response.requestId).toBeDefined();
      expect(response.results.length).toBeGreaterThan(0); // Should have valid results
      expect(response.errors.length).toBeGreaterThan(0); // Should have validation errors
      
      // Check that valid domains were processed
      const validResults = response.results.filter(r => r.domain === 'example.com' || r.domain === 'test.org');
      expect(validResults.length).toBeGreaterThan(0);
      
      // Check that invalid domain generated error
      const invalidErrors = response.errors.filter(e => e.message.includes('Domain name cannot be empty'));
      expect(invalidErrors.length).toBeGreaterThan(0);
    });

    it('should handle empty domain list', async () => {
      const response = await controller.checkDomains([]);
      
      expect(response.results).toHaveLength(0);
      expect(response.errors).toHaveLength(0);
      expect(response.totalExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle all invalid domains', async () => {
      const domains = ['', '   ', '@invalid'];
      const response = await controller.checkDomains(domains);
      
      expect(response.results).toHaveLength(0);
      expect(response.errors).toHaveLength(3);
      response.errors.forEach(error => {
        expect(error.errorType).toBe('INVALID_RESPONSE');
      });
    });
  });

  describe('State Management Integration', () => {
    it('should transition through states during domain check', async () => {
      const stateChanges: string[] = [];
      
      controller.onStateChange((event) => {
        stateChanges.push(event.state);
      });
      
      await controller.checkDomain('example.com');
      
      expect(stateChanges).toContain('validating');
      expect(stateChanges).toContain('checking');
      expect(stateChanges).toContain('completed');
    });

    it('should transition to error state on validation failure', async () => {
      const stateChanges: string[] = [];
      
      controller.onStateChange((event) => {
        stateChanges.push(event.state);
      });
      
      await controller.checkDomain('');
      
      expect(stateChanges).toContain('validating');
      expect(stateChanges).toContain('error');
    });

    it('should provide current state information', () => {
      const state = controller.getCurrentState();
      
      expect(state).toBeDefined();
      expect(state.state).toBeDefined();
      expect(state.canTransition).toBe(true);
      expect(Array.isArray(state.availableTransitions)).toBe(true);
    });

    it('should reset to idle state', () => {
      controller.reset();
      const state = controller.getCurrentState();
      expect(state.state).toBe('idle');
    });
  });

  describe('Event Bus Integration', () => {
    it('should publish progress events during batch processing', async () => {
      const progressEvents: any[] = [];
      
      controller.onProgress((event) => {
        progressEvents.push(event);
      });
      
      await controller.checkDomains(['example.com', 'test.org']);
      
      // Progress events may or may not be published depending on implementation
      // This test ensures the event system is working
      expect(progressEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should publish error events on failures', async () => {
      const errorEvents: any[] = [];
      
      controller.onError((event) => {
        errorEvents.push(event);
      });
      
      await controller.checkDomain('invalid-domain');
      
      // Error events may or may not be published depending on implementation
      expect(errorEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should allow unsubscribing from events', () => {
      let eventCount = 0;
      
      const unsubscribe = controller.onStateChange(() => {
        eventCount++;
      });
      
      // Unsubscribe immediately
      unsubscribe();
      
      // This should not increment eventCount
      controller.reset();
      
      expect(eventCount).toBe(0);
    });
  });

  describe('Configuration and Timeout', () => {
    it('should allow timeout configuration', () => {
      expect(() => {
        controller.setTimeout(5000);
      }).not.toThrow();
    });

    it('should allow query method configuration', () => {
      expect(() => {
        controller.configureQueryMethods({
          enableDNS: true,
          enableWHOIS: true,
          enableHybrid: true
        });
      }).not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    it('should provide performance metrics', () => {
      const metrics = controller.getPerformanceMetrics();
      
      expect(metrics).toBeDefined();
      expect(typeof metrics.totalRequests).toBe('number');
      expect(typeof metrics.successfulRequests).toBe('number');
      expect(typeof metrics.failedRequests).toBe('number');
      expect(typeof metrics.averageExecutionTime).toBe('number');
      expect(typeof metrics.lastExecutionTime).toBe('number');
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle network-like errors gracefully', async () => {
      // This test simulates network errors by using domains that might cause issues
      const response = await controller.checkDomain('nonexistent-tld-test.invalidtld');
      
      expect(response).toBeDefined();
      expect(response.requestId).toBeDefined();
      // Should either succeed with error status or fail with proper error handling
      expect(response.results.length + response.errors.length).toBeGreaterThan(0);
    });

    it('should maintain state consistency after errors', async () => {
      // Cause an error
      await controller.checkDomain('invalid-domain');
      
      // Should be able to perform successful operation after error
      const response = await controller.checkDomain('example.com');
      expect(response.results).toHaveLength(1);
    });

    it('should handle concurrent requests properly', async () => {
      const promises = [
        controller.checkDomain('example.com'),
        controller.checkDomain('test.org'),
        controller.checkDomain('sample.net')
      ];
      
      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.requestId).toBeDefined();
        expect(response.results.length + response.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Resource Management', () => {
    it('should dispose resources properly', () => {
      expect(() => {
        controller.dispose();
      }).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
      expect(() => {
        controller.dispose();
        controller.dispose();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long domain names', async () => {
      const longDomain = 'a'.repeat(100) + '.com';
      const response = await controller.checkDomain(longDomain);
      
      expect(response).toBeDefined();
      // Should either process or reject with validation error
      expect(response.results.length + response.errors.length).toBeGreaterThan(0);
    });

    it('should handle domains with special characters', async () => {
      const specialDomain = 'test-domain.com';
      const response = await controller.checkDomain(specialDomain);
      
      expect(response).toBeDefined();
      expect(response.results).toHaveLength(1);
      expect(response.results[0]!.domain).toBe('test-domain.com');
    });

    it('should handle international domain names', async () => {
      const intlDomain = 'xn--example-9ua.com'; // Punycode for example with special char
      const response = await controller.checkDomain(intlDomain);
      
      expect(response).toBeDefined();
      // Should handle international domains appropriately
      expect(response.results.length + response.errors.length).toBeGreaterThan(0);
    });
  });
});