import { DomainQueryEngine } from '../../../src/services/DomainQueryEngine';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';
import type { IDomainResult } from '../../../src/models';
import type { IQueryStrategy, IStrategyConfig } from '../../../src/patterns/strategy/IQueryStrategy';

// Mock query strategy for testing
class MockQueryStrategy implements IQueryStrategy {
  private config: IStrategyConfig = {
    timeoutMs: 5000,
    maxRetries: 3,
    retryDelayMs: 1000,
    useExponentialBackoff: false,
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
      executionTime: 100
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

  getServiceType(): string {
    return 'MOCK';
  }

  getConfig(): IStrategyConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<IStrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

describe('DomainQueryEngine', () => {
  let engine: DomainQueryEngine;
  let mockStrategy: MockQueryStrategy;

  beforeEach(() => {
    engine = new DomainQueryEngine();
    mockStrategy = new MockQueryStrategy();
  });

  describe('TLD Management', () => {
    test('should return all supported TLDs', () => {
      const tlds = engine.getSupportedTLDs();
      
      expect(tlds).toEqual(['.com', '.net', '.org', '.ai', '.dev', '.io', '.co']);
      expect(tlds).toHaveLength(7);
    });

    test('should return a copy of TLDs array', () => {
      const tlds1 = engine.getSupportedTLDs();
      const tlds2 = engine.getSupportedTLDs();
      
      expect(tlds1).not.toBe(tlds2); // Different array instances
      expect(tlds1).toEqual(tlds2); // Same content
    });

    test('should validate supported domains correctly', () => {
      expect(engine.isSupportedDomain('example.com')).toBe(true);
      expect(engine.isSupportedDomain('test.net')).toBe(true);
      expect(engine.isSupportedDomain('site.ai')).toBe(true);
      expect(engine.isSupportedDomain('app.dev')).toBe(true);
      
      expect(engine.isSupportedDomain('example.xyz')).toBe(false);
      expect(engine.isSupportedDomain('test.info')).toBe(false);
      expect(engine.isSupportedDomain('invalid')).toBe(false);
    });

    test('should handle case insensitive domain validation', () => {
      expect(engine.isSupportedDomain('EXAMPLE.COM')).toBe(true);
      expect(engine.isSupportedDomain('Test.NET')).toBe(true);
      expect(engine.isSupportedDomain('SITE.AI')).toBe(true);
    });
  });

  describe('Domain Construction', () => {
    test('should construct domains for all supported TLDs', () => {
      const domains = engine.constructDomains('example');
      
      expect(domains).toEqual([
        'example.com',
        'example.net',
        'example.org',
        'example.ai',
        'example.dev',
        'example.io',
        'example.co'
      ]);
    });

    test('should handle case normalization', () => {
      const domains = engine.constructDomains('EXAMPLE');
      
      expect(domains).toEqual([
        'example.com',
        'example.net',
        'example.org',
        'example.ai',
        'example.dev',
        'example.io',
        'example.co'
      ]);
    });

    test('should trim whitespace from base domain', () => {
      const domains = engine.constructDomains('  example  ');
      
      expect(domains[0]).toBe('example.com');
      expect(domains).toHaveLength(7);
    });

    test('should throw error for empty base domain', () => {
      expect(() => engine.constructDomains('')).toThrow('Base domain must be a non-empty string');
      expect(() => engine.constructDomains('   ')).toThrow('Base domain cannot be empty after sanitization');
    });

    test('should throw error for invalid base domain types', () => {
      expect(() => engine.constructDomains(null as any)).toThrow('Base domain must be a non-empty string');
      expect(() => engine.constructDomains(undefined as any)).toThrow('Base domain must be a non-empty string');
      expect(() => engine.constructDomains(123 as any)).toThrow('Base domain must be a non-empty string');
    });
  });

  describe('Base Domain Extraction', () => {
    test('should extract base domain from supported domains', () => {
      expect(engine.extractBaseDomain('example.com')).toBe('example');
      expect(engine.extractBaseDomain('test.net')).toBe('test');
      expect(engine.extractBaseDomain('mysite.ai')).toBe('mysite');
      expect(engine.extractBaseDomain('app.dev')).toBe('app');
    });

    test('should handle case insensitive extraction', () => {
      expect(engine.extractBaseDomain('EXAMPLE.COM')).toBe('example');
      expect(engine.extractBaseDomain('Test.NET')).toBe('test');
    });

    test('should return null for unsupported domains', () => {
      expect(engine.extractBaseDomain('example.xyz')).toBeNull();
      expect(engine.extractBaseDomain('test.info')).toBeNull();
      expect(engine.extractBaseDomain('invalid')).toBeNull();
    });

    test('should handle complex domain names', () => {
      expect(engine.extractBaseDomain('my-awesome-site.com')).toBe('my-awesome-site');
      expect(engine.extractBaseDomain('test123.io')).toBe('test123');
    });
  });

  describe('Result Initialization', () => {
    test('should initialize results for all TLDs', () => {
      const results = engine.initializeDomainResults('example');
      
      expect(results).toHaveLength(7);
      
      results.forEach((result) => {
        expect(result.baseDomain).toBe('example');
        expect(result.status).toBe(AvailabilityStatus.CHECKING);
        expect(result.checkMethod).toBe('HYBRID');
        expect(result.retryCount).toBe(0);
        expect(result.lastChecked).toBeInstanceOf(Date);
        expect(result.domain).toContain('example');
      });
    });

    test('should set correct TLD for each result', () => {
      const results = engine.initializeDomainResults('test');
      const expectedTLDs = ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'];
      
      results.forEach((result, index) => {
        expect(result.tld).toBe(expectedTLDs[index]);
        expect(result.domain).toBe(`test${expectedTLDs[index]}`);
      });
    });

    test('should store results internally', () => {
      engine.initializeDomainResults('example');
      
      expect(engine.getResult('example.com')).toBeDefined();
      expect(engine.getResult('example.net')).toBeDefined();
      expect(engine.getAllResults()).toHaveLength(7);
    });
  });

  describe('Query Strategy Management', () => {
    test('should set and use query strategy', () => {
      engine.setQueryStrategy(mockStrategy);
      
      // Strategy should be set (we can't directly test this, but commands should work)
      expect(() => engine.createDomainCheckCommand('example.com')).not.toThrow();
    });

    test('should throw error when creating commands without strategy', () => {
      expect(() => engine.createDomainCheckCommand('example.com'))
        .toThrow('Query strategy must be set before creating commands');
      
      expect(() => engine.createBatchCheckCommand(['example.com']))
        .toThrow('Query strategy must be set before creating commands');
    });
  });

  describe('Command Creation', () => {
    beforeEach(() => {
      engine.setQueryStrategy(mockStrategy);
    });

    test('should create single domain check command', () => {
      const command = engine.createDomainCheckCommand('example.com');
      
      expect(command).toBeDefined();
      expect(typeof command.execute).toBe('function');
      expect(typeof command.undo).toBe('function');
    });

    test('should create batch check command', () => {
      const domains = ['example.com', 'test.net', 'site.org'];
      const command = engine.createBatchCheckCommand(domains);
      
      expect(command).toBeDefined();
      expect(typeof command.execute).toBe('function');
      expect(typeof command.undo).toBe('function');
    });

    test('should throw error for empty domains array in batch command', () => {
      expect(() => engine.createBatchCheckCommand([]))
        .toThrow('Domains array cannot be empty');
      
      expect(() => engine.createBatchCheckCommand(null as any))
        .toThrow('Domains array cannot be empty');
    });
  });

  describe('Result Management', () => {
    beforeEach(() => {
      engine.initializeDomainResults('example');
    });

    test('should update domain results', () => {
      const updatedResult: IDomainResult = {
        domain: 'example.com',
        baseDomain: 'example',
        tld: '.com',
        status: AvailabilityStatus.AVAILABLE,
        lastChecked: new Date(),
        checkMethod: 'DNS' as const,
        retryCount: 1,
        executionTime: 150
      };

      engine.updateResult('example.com', updatedResult);
      
      const result = engine.getResult('example.com');
      expect(result?.status).toBe(AvailabilityStatus.AVAILABLE);
      expect(result?.checkMethod).toBe('DNS');
      expect(result?.retryCount).toBe(1);
      expect(result?.executionTime).toBe(150);
    });

    test('should get result for specific domain', () => {
      const result = engine.getResult('example.com');
      
      expect(result).toBeDefined();
      expect(result?.domain).toBe('example.com');
      expect(result?.baseDomain).toBe('example');
    });

    test('should return undefined for non-existent domain', () => {
      const result = engine.getResult('nonexistent.com');
      expect(result).toBeUndefined();
    });

    test('should get all results', () => {
      const results = engine.getAllResults();
      
      expect(results).toHaveLength(7);
      expect(results.every(r => r.baseDomain === 'example')).toBe(true);
    });

    test('should filter results by status', () => {
      // Update some results to different statuses
      engine.updateResult('example.com', {
        ...engine.getResult('example.com')!,
        status: AvailabilityStatus.AVAILABLE
      });
      
      engine.updateResult('example.net', {
        ...engine.getResult('example.net')!,
        status: AvailabilityStatus.TAKEN
      });

      const availableResults = engine.getResultsByStatus(AvailabilityStatus.AVAILABLE);
      const takenResults = engine.getResultsByStatus(AvailabilityStatus.TAKEN);
      const checkingResults = engine.getResultsByStatus(AvailabilityStatus.CHECKING);

      expect(availableResults).toHaveLength(1);
      expect(takenResults).toHaveLength(1);
      expect(checkingResults).toHaveLength(5);
    });
  });

  describe('Results Summary', () => {
    beforeEach(() => {
      engine.initializeDomainResults('example');
      
      // Set up different statuses for testing
      engine.updateResult('example.com', {
        ...engine.getResult('example.com')!,
        status: AvailabilityStatus.AVAILABLE
      });
      
      engine.updateResult('example.net', {
        ...engine.getResult('example.net')!,
        status: AvailabilityStatus.TAKEN
      });
      
      engine.updateResult('example.org', {
        ...engine.getResult('example.org')!,
        status: AvailabilityStatus.ERROR
      });
    });

    test('should provide accurate results summary', () => {
      const summary = engine.getResultsSummary();
      
      expect(summary.total).toBe(7);
      expect(summary.available).toBe(1);
      expect(summary.taken).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.checking).toBe(4);
      expect(summary.completed).toBe(3); // available + taken + errors
    });

    test('should check completion status', () => {
      expect(engine.isComplete()).toBe(false); // Still has checking domains
      
      // Mark all as complete
      engine.getAllResults().forEach(result => {
        engine.updateResult(result.domain, {
          ...result,
          status: AvailabilityStatus.AVAILABLE
        });
      });
      
      expect(engine.isComplete()).toBe(true);
    });
  });

  describe('Retry Management', () => {
    beforeEach(() => {
      engine.initializeDomainResults('example');
      
      // Set up some failed results with different retry counts
      engine.updateResult('example.com', {
        ...engine.getResult('example.com')!,
        status: AvailabilityStatus.ERROR,
        retryCount: 1
      });
      
      engine.updateResult('example.net', {
        ...engine.getResult('example.net')!,
        status: AvailabilityStatus.ERROR,
        retryCount: 3
      });
      
      engine.updateResult('example.org', {
        ...engine.getResult('example.org')!,
        status: AvailabilityStatus.ERROR,
        retryCount: 0
      });
    });

    test('should identify retryable domains', () => {
      const retryable = engine.getRetryableDomains(3);
      
      expect(retryable).toContain('example.com'); // retryCount: 1 < 3
      expect(retryable).toContain('example.org'); // retryCount: 0 < 3
      expect(retryable).not.toContain('example.net'); // retryCount: 3 >= 3
    });

    test('should respect custom max retries', () => {
      const retryable = engine.getRetryableDomains(1);
      
      expect(retryable).toContain('example.org'); // retryCount: 0 < 1
      expect(retryable).not.toContain('example.com'); // retryCount: 1 >= 1
      expect(retryable).not.toContain('example.net'); // retryCount: 3 >= 1
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      engine.initializeDomainResults('example');
      
      // Set up results with execution times
      engine.updateResult('example.com', {
        ...engine.getResult('example.com')!,
        status: AvailabilityStatus.AVAILABLE,
        executionTime: 100
      });
      
      engine.updateResult('example.net', {
        ...engine.getResult('example.net')!,
        status: AvailabilityStatus.TAKEN,
        executionTime: 200
      });
      
      engine.updateResult('example.org', {
        ...engine.getResult('example.org')!,
        status: AvailabilityStatus.ERROR,
        executionTime: 300
      });
    });

    test('should calculate fastest check time', () => {
      const fastest = engine.getFastestCheckTime();
      expect(fastest).toBe(100); // Excludes error results
    });

    test('should calculate average check time', () => {
      const average = engine.getAverageCheckTime();
      expect(average).toBe(150); // (100 + 200) / 2, excludes error results
    });

    test('should return null for metrics when no successful results', () => {
      engine.reset();
      engine.initializeDomainResults('test');
      
      expect(engine.getFastestCheckTime()).toBeNull();
      expect(engine.getAverageCheckTime()).toBeNull();
    });
  });

  describe('Reset Functionality', () => {
    test('should clear all results on reset', () => {
      engine.initializeDomainResults('example');
      expect(engine.getAllResults()).toHaveLength(7);
      
      engine.reset();
      expect(engine.getAllResults()).toHaveLength(0);
      expect(engine.getResult('example.com')).toBeUndefined();
    });

    test('should allow reinitialization after reset', () => {
      engine.initializeDomainResults('example');
      engine.reset();
      
      const newResults = engine.initializeDomainResults('test');
      expect(newResults).toHaveLength(7);
      expect(newResults[0]?.baseDomain).toBe('test');
    });
  });
});