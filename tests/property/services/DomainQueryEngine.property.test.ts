import * as fc from 'fast-check';
import { DomainQueryEngine } from '../../../src/services/DomainQueryEngine';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';
import type { IDomainResult } from '../../../src/models';
import type { IQueryStrategy, IStrategyConfig } from '../../../src/patterns/strategy/IQueryStrategy';

// Mock query strategy for property testing
class MockQueryStrategy implements IQueryStrategy {
  private config: IStrategyConfig = {
    timeout: 5000,
    retries: 3,
    priority: 1,
    enabled: true
  };

  async execute(domain: string): Promise<IDomainResult> {
    const parts = domain.split('.');
    const baseDomain = parts[0] || 'unknown';
    const tld = parts.length > 1 ? '.' + parts.slice(1).join('.') : '.com';
    
    return {
      domain,
      baseDomain,
      tld,
      status: AvailabilityStatus.AVAILABLE,
      lastChecked: new Date(),
      checkMethod: 'HYBRID' as const,
      retryCount: 0,
      executionTime: Math.floor(Math.random() * 1000) + 50
    };
  }

  canHandle(domain: string): boolean {
    return domain.includes('.');
  }

  getPriority(): number {
    return this.config.priority;
  }

  getName(): string {
    return 'MockStrategy';
  }

  getConfig(): IStrategyConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<IStrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

describe('DomainQueryEngine Property Tests', () => {
  let engine: DomainQueryEngine;
  let mockStrategy: MockQueryStrategy;

  beforeEach(() => {
    engine = new DomainQueryEngine();
    mockStrategy = new MockQueryStrategy();
    engine.reset(); // Ensure clean state
  });

  /**
   * **Property 2: Comprehensive TLD Processing**
   * For any valid base domain, the system should create exactly 7 domain results
   * (one for each supported TLD) and all results should have consistent structure.
   * **Validates: Requirements 2.1, 2.2, 5.2**
   */
  describe('Property 2: Comprehensive TLD Processing', () => {
    test('should always create exactly 7 domains for any valid base domain', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, 'a').replace(/^-+|-+$/g, 'a')),
        (baseDomain: string) => {
          // Skip empty domains after sanitization
          if (!baseDomain || baseDomain.length === 0) return;
          
          const domains = engine.constructDomains(baseDomain);
          
          // Should always create exactly 7 domains
          expect(domains).toHaveLength(7);
          
          // Each domain should contain the base domain
          domains.forEach(domain => {
            expect(domain.toLowerCase()).toContain(baseDomain.toLowerCase());
          });
          
          // Should cover all supported TLDs
          const expectedTLDs = ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'];
          expectedTLDs.forEach(tld => {
            expect(domains.some(domain => domain.endsWith(tld))).toBe(true);
          });
        }
      ), { numRuns: 30 });
    });

    test('should initialize consistent result structure for any base domain', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 15 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, 'a').replace(/^-+|-+$/g, 'a')),
        (baseDomain: string) => {
          if (!baseDomain || baseDomain.length === 0) return;
          
          const results = engine.initializeDomainResults(baseDomain);
          
          // Should create exactly 7 results
          expect(results).toHaveLength(7);
          
          // All results should have consistent structure
          results.forEach(result => {
            expect(result.baseDomain).toBe(baseDomain.toLowerCase().trim());
            expect(result.status).toBe(AvailabilityStatus.CHECKING);
            expect(result.checkMethod).toBe('HYBRID');
            expect(result.retryCount).toBe(0);
            expect(result.lastChecked).toBeInstanceOf(Date);
            expect(typeof result.domain).toBe('string');
            expect(typeof result.tld).toBe('string');
            expect(result.tld.startsWith('.')).toBe(true);
          });
        }
      ), { numRuns: 25 });
    });

    test('should maintain TLD consistency across operations', () => {
      fc.assert(fc.property(
        fc.constantFrom('test', 'example', 'mysite', 'app123', 'domain-name'),
        (baseDomain: string) => {
          const domains = engine.constructDomains(baseDomain);
          const results = engine.initializeDomainResults(baseDomain);
          
          // Domain construction and result initialization should be consistent
          expect(domains).toHaveLength(results.length);
          
          domains.forEach((domain, index) => {
            if (index < results.length) {
              expect(results[index]?.domain).toBe(domain);
              expect(domain.startsWith(baseDomain.toLowerCase())).toBe(true);
            }
          });
        }
      ), { numRuns: 20 });
    });
  });

  /**
   * **Property 3: Domain Validation Consistency**
   * For any domain string, validation should be consistent and deterministic
   */
  describe('Property 3: Domain Validation Consistency', () => {
    test('should consistently validate supported domains', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constantFrom('example.com', 'test.net', 'site.org', 'app.ai', 'my.dev', 'api.io', 'web.co'),
          fc.constantFrom('invalid.xyz', 'test.info', 'site.biz', 'notvalid')
        ),
        (domain: string) => {
          const isSupported1 = engine.isSupportedDomain(domain);
          const isSupported2 = engine.isSupportedDomain(domain);
          
          // Should be deterministic
          expect(isSupported1).toBe(isSupported2);
          
          // Should be case insensitive
          const isSupported3 = engine.isSupportedDomain(domain.toUpperCase());
          expect(isSupported1).toBe(isSupported3);
        }
      ), { numRuns: 25 });
    });

    test('should extract base domain consistently', () => {
      fc.assert(fc.property(
        fc.constantFrom('example.com', 'test.net', 'mysite.org', 'app.ai'),
        (domain: string) => {
          const baseDomain1 = engine.extractBaseDomain(domain);
          const baseDomain2 = engine.extractBaseDomain(domain);
          
          // Should be deterministic
          expect(baseDomain1).toBe(baseDomain2);
          
          // Should be case insensitive
          const baseDomain3 = engine.extractBaseDomain(domain.toUpperCase());
          expect(baseDomain1).toBe(baseDomain3);
          
          // Should return valid base domain for supported domains
          if (engine.isSupportedDomain(domain)) {
            expect(baseDomain1).not.toBeNull();
            expect(typeof baseDomain1).toBe('string');
            expect(baseDomain1!.length).toBeGreaterThan(0);
          }
        }
      ), { numRuns: 20 });
    });
  });

  /**
   * **Property 4: Result Format Consistency**
   * For any domain result operations, the result format should remain consistent
   * **Validates: Requirements 2.4, 5.4**
   */
  describe('Property 4: Result Format Consistency', () => {
    test('should maintain result structure consistency across updates', () => {
      fc.assert(fc.property(
        fc.constantFrom('example', 'test', 'mysite'),
        fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN, AvailabilityStatus.ERROR),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 50, max: 2000 }),
        (baseDomain: string, status: AvailabilityStatus, retryCount: number, executionTime: number) => {
          engine.initializeDomainResults(baseDomain);
          const domain = `${baseDomain}.com`;
          
          const originalResult = engine.getResult(domain);
          expect(originalResult).toBeDefined();
          
          // Update result
          const updatedResult: IDomainResult = {
            ...originalResult!,
            status,
            retryCount,
            executionTime
          };
          
          engine.updateResult(domain, updatedResult);
          const retrievedResult = engine.getResult(domain);
          
          // Structure should remain consistent
          expect(retrievedResult).toBeDefined();
          expect(retrievedResult!.domain).toBe(domain);
          expect(retrievedResult!.baseDomain).toBe(baseDomain);
          expect(retrievedResult!.status).toBe(status);
          expect(retrievedResult!.retryCount).toBe(retryCount);
          expect(retrievedResult!.executionTime).toBe(executionTime);
          expect(retrievedResult!.lastChecked).toBeInstanceOf(Date);
        }
      ), { numRuns: 25 });
    });

    test('should provide consistent summary calculations', () => {
      fc.assert(fc.property(
        fc.constantFrom('test', 'example'),
        fc.array(fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN, AvailabilityStatus.ERROR), { minLength: 1, maxLength: 7 }),
        (baseDomain: string, statuses: AvailabilityStatus[]) => {
          engine.reset(); // Ensure clean state for each test
          engine.initializeDomainResults(baseDomain);
          const domains = engine.constructDomains(baseDomain);
          
          // Update some results to different statuses
          statuses.forEach((status, index) => {
            if (index < domains.length && domains[index]) {
              engine.updateResult(domains[index]!, {
                ...engine.getResult(domains[index]!)!,
                status
              });
            }
          });
          
          const summary = engine.getResultsSummary();
          
          // Summary should be mathematically consistent
          expect(summary.total).toBe(7); // Always 7 TLDs
          expect(summary.completed).toBe(summary.available + summary.taken + summary.errors);
          expect(summary.total).toBe(summary.completed + summary.checking);
          
          // Counts should be non-negative
          expect(summary.available).toBeGreaterThanOrEqual(0);
          expect(summary.taken).toBeGreaterThanOrEqual(0);
          expect(summary.errors).toBeGreaterThanOrEqual(0);
          expect(summary.checking).toBeGreaterThanOrEqual(0);
        }
      ), { numRuns: 20 });
    });
  });

  /**
   * **Property 5: Performance Metrics Consistency**
   * Performance calculations should be mathematically sound and consistent
   */
  describe('Property 5: Performance Metrics Consistency', () => {
    test('should calculate performance metrics correctly', () => {
      fc.assert(fc.property(
        fc.constantFrom('test', 'example'),
        fc.array(fc.integer({ min: 50, max: 1000 }), { minLength: 1, maxLength: 7 }),
        (baseDomain: string, executionTimes: number[]) => {
          engine.reset(); // Ensure clean state for each test
          engine.initializeDomainResults(baseDomain);
          const domains = engine.constructDomains(baseDomain);
          
          // Set up results with execution times (non-error status)
          executionTimes.forEach((time, index) => {
            if (index < domains.length && domains[index]) {
              engine.updateResult(domains[index]!, {
                ...engine.getResult(domains[index]!)!,
                status: AvailabilityStatus.AVAILABLE,
                executionTime: time
              });
            }
          });
          
          const fastest = engine.getFastestCheckTime();
          const average = engine.getAverageCheckTime();
          
          if (executionTimes.length > 0) {
            // Should have valid metrics
            expect(fastest).not.toBeNull();
            expect(average).not.toBeNull();
            
            // Fastest should be minimum of execution times
            expect(fastest).toBe(Math.min(...executionTimes.slice(0, Math.min(executionTimes.length, domains.length))));
            
            // Average should be mathematically correct
            const validTimes = executionTimes.slice(0, Math.min(executionTimes.length, domains.length));
            const expectedAverage = validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length;
            expect(average).toBeCloseTo(expectedAverage, 2);
            
            // Fastest should be <= average
            expect(fastest!).toBeLessThanOrEqual(average!);
          }
        }
      ), { numRuns: 20 });
    });
  });

  /**
   * **Property 6: State Consistency**
   * Engine state should remain consistent across all operations
   */
  describe('Property 6: State Consistency', () => {
    test('should maintain consistent state across operations', () => {
      fc.assert(fc.property(
        fc.constantFrom('test', 'example', 'mysite'),
        (baseDomain: string) => {
          engine.reset(); // Ensure clean state for each test
          // Initialize
          engine.initializeDomainResults(baseDomain);
          expect(engine.getAllResults()).toHaveLength(7);
          expect(engine.isComplete()).toBe(false); // All should be CHECKING initially
          
          // Update some results
          const domains = engine.constructDomains(baseDomain);
          if (domains[0]) {
            engine.updateResult(domains[0], {
              ...engine.getResult(domains[0])!,
              status: AvailabilityStatus.AVAILABLE
            });
          
            // State should be consistent
            expect(engine.getAllResults()).toHaveLength(7);
            expect(engine.getResult(domains[0])?.status).toBe(AvailabilityStatus.AVAILABLE);
          
            // Reset should clear everything
            engine.reset();
            expect(engine.getAllResults()).toHaveLength(0);
            expect(engine.getResult(domains[0])).toBeUndefined();
          }
        }
      ), { numRuns: 15 });
    });

    test('should handle retry logic consistently', () => {
      fc.assert(fc.property(
        fc.constantFrom('test', 'example'),
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 7 }),
        fc.integer({ min: 1, max: 3 }),
        (baseDomain: string, retryCounts: number[], maxRetries: number) => {
          engine.reset(); // Ensure clean state for each test
          engine.initializeDomainResults(baseDomain);
          const domains = engine.constructDomains(baseDomain);
          
          // Set up error results with different retry counts
          retryCounts.forEach((retryCount, index) => {
            if (index < domains.length && domains[index]) {
              engine.updateResult(domains[index]!, {
                ...engine.getResult(domains[index]!)!,
                status: AvailabilityStatus.ERROR,
                retryCount
              });
            }
          });
          
          const retryableDomains = engine.getRetryableDomains(maxRetries);
          
          // Should only include domains with retryCount < maxRetries
          retryableDomains.forEach(domain => {
            const result = engine.getResult(domain);
            expect(result).toBeDefined();
            expect(result!.status).toBe(AvailabilityStatus.ERROR);
            expect(result!.retryCount || 0).toBeLessThan(maxRetries);
          });
          
          // Count should be consistent
          const expectedRetryableCount = retryCounts
            .slice(0, Math.min(retryCounts.length, domains.length))
            .filter(count => count < maxRetries).length;
          expect(retryableDomains).toHaveLength(expectedRetryableCount);
        }
      ), { numRuns: 20 });
    });
  });

  /**
   * **Property 7: Command Creation Consistency**
   * Command creation should be consistent and follow strategy pattern correctly
   */
  describe('Property 7: Command Creation Consistency', () => {
    beforeEach(() => {
      engine.setQueryStrategy(mockStrategy);
    });

    test('should create commands consistently', () => {
      fc.assert(fc.property(
        fc.constantFrom('example.com', 'test.net', 'site.org'),
        (domain: string) => {
          const command1 = engine.createDomainCheckCommand(domain);
          const command2 = engine.createDomainCheckCommand(domain);
          
          // Should create valid command objects
          expect(command1).toBeDefined();
          expect(command2).toBeDefined();
          expect(typeof command1.execute).toBe('function');
          expect(typeof command2.execute).toBe('function');
          expect(typeof command1.undo).toBe('function');
          expect(typeof command2.undo).toBe('function');
          
          // Commands should be independent instances
          expect(command1).not.toBe(command2);
        }
      ), { numRuns: 15 });
    });

    test('should create batch commands consistently', () => {
      fc.assert(fc.property(
        fc.array(fc.constantFrom('example.com', 'test.net', 'site.org'), { minLength: 1, maxLength: 5 }),
        (domains: string[]) => {
          const batchCommand = engine.createBatchCheckCommand(domains);
          
          // Should create valid batch command
          expect(batchCommand).toBeDefined();
          expect(typeof batchCommand.execute).toBe('function');
          expect(typeof batchCommand.undo).toBe('function');
        }
      ), { numRuns: 15 });
    });
  });
});