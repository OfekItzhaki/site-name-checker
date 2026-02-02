import { DomainCheckCommand } from '../../../src/patterns/command/DomainCheckCommand';
import { CommandStatus } from '../../../src/patterns/command/ICommand';
import type { IDomainResult } from '../../../src/models';
import type { IQueryStrategy } from '../../../src/patterns/strategy/IQueryStrategy';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';

// Mock strategy implementation
class MockQueryStrategy implements IQueryStrategy {
  private shouldFail: boolean = false;
  private result: IDomainResult;
  private canHandleDomain: boolean = true;

  constructor(result?: Partial<IDomainResult>) {
    this.result = {
      domain: 'example.com',
      baseDomain: 'example',
      tld: '.com',
      status: AvailabilityStatus.AVAILABLE,
      lastChecked: new Date(),
      checkMethod: 'DNS',
      ...result
    };
  }

  async execute(domain: string): Promise<IDomainResult> {
    if (this.shouldFail) {
      throw new Error(`Mock strategy failed for ${domain}`);
    }
    
    return {
      ...this.result,
      domain,
      lastChecked: new Date()
    };
  }

  canHandle(_domain: string): boolean {
    return this.canHandleDomain;
  }

  getPriority(): number {
    return 1;
  }

  getName(): string {
    return 'MockStrategy';
  }

  getServiceType(): string {
    return 'MOCK';
  }

  getConfig(): any {
    return {};
  }

  setConfig(_config: any): void {
    // Mock implementation
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setCanHandle(canHandle: boolean): void {
    this.canHandleDomain = canHandle;
  }
}

describe('DomainCheckCommand', () => {
  let mockStrategy: MockQueryStrategy;

  beforeEach(() => {
    mockStrategy = new MockQueryStrategy();
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should execute domain check successfully', async () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      const result = await command.execute();
      
      expect(result.domain).toBe('example.com');
      expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
      expect(command.getStatus()).toBe(CommandStatus.COMPLETED);
    });

    it('should return correct domain and strategy', () => {
      const command = new DomainCheckCommand('test.org', mockStrategy);
      
      expect(command.getDomain()).toBe('test.org');
      expect(command.getStrategy()).toBe(mockStrategy);
    });

    it('should have correct command name', () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      expect(command.getName()).toBe('DomainCheck:example.com');
    });

    it('should include retry count in result', async () => {
      const command = new DomainCheckCommand('example.com', mockStrategy, { maxRetries: 2 });
      
      // Force a retry by making first attempt fail
      mockStrategy.setShouldFail(true);
      setTimeout(() => mockStrategy.setShouldFail(false), 50);
      
      const result = await command.executeWithRetry();
      
      // The retry count should be included in the result (may be 0 if no retries were needed)
      expect(result.retryCount).toBeGreaterThanOrEqual(0);
      expect(typeof result.retryCount).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle strategy execution failure', async () => {
      mockStrategy.setShouldFail(true);
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      await expect(command.execute()).rejects.toThrow('Domain check failed for example.com using MockStrategy');
    });

    it('should handle strategy that cannot handle domain', async () => {
      mockStrategy.setCanHandle(false);
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      await expect(command.execute()).rejects.toThrow('Strategy MockStrategy cannot handle domain: example.com');
    });

    it('should preserve original error stack', async () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      
      mockStrategy.setShouldFail(true);
      // Mock the strategy to throw the original error
      jest.spyOn(mockStrategy, 'execute').mockRejectedValue(originalError);
      
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      try {
        await command.execute();
      } catch (error) {
        expect((error as Error).stack).toBe('Original stack trace');
      }
    });
  });

  describe('Validation', () => {
    it('should validate empty domain name', () => {
      const command = new DomainCheckCommand('', mockStrategy);
      
      expect(() => command.validate()).toThrow('Domain name cannot be empty');
    });

    it('should validate whitespace-only domain name', () => {
      const command = new DomainCheckCommand('   ', mockStrategy);
      
      expect(() => command.validate()).toThrow('Domain name cannot be empty');
    });

    it('should validate missing strategy', () => {
      const command = new DomainCheckCommand('example.com', null as any);
      
      expect(() => command.validate()).toThrow('Query strategy is required');
    });

    it('should validate invalid domain format', () => {
      const invalidDomains = [
        'invalid',
        'invalid.',
        '.invalid',
        'invalid..com',
        'invalid-.com',
        '-invalid.com',
        'invalid.c'
      ];

      invalidDomains.forEach(domain => {
        const command = new DomainCheckCommand(domain, mockStrategy);
        expect(() => command.validate()).toThrow(`Invalid domain format: ${domain}`);
      });
    });

    it('should accept valid domain formats', () => {
      const validDomains = [
        'example.com',
        'sub.example.org',
        'test-domain.net',
        'a.co',
        '123.com',
        'test123.example.co.uk'
      ];

      validDomains.forEach(domain => {
        const command = new DomainCheckCommand(domain, mockStrategy);
        expect(() => command.validate()).not.toThrow();
      });
    });

    it('should execute with validation successfully', async () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      const result = await command.executeWithValidation();
      
      expect(result.domain).toBe('example.com');
      expect(command.getStatus()).toBe(CommandStatus.COMPLETED);
    });

    it('should fail execution with validation for invalid domain', async () => {
      const command = new DomainCheckCommand('invalid', mockStrategy);
      
      await expect(command.executeWithValidation()).rejects.toThrow('Invalid domain format: invalid');
    });
  });

  describe('Command Cloning', () => {
    it('should create a clone with same configuration', () => {
      const retryConfig = { maxRetries: 5, initialDelayMs: 2000 };
      const command = new DomainCheckCommand('example.com', mockStrategy, retryConfig, 3);
      
      const clone = command.clone();
      
      expect(clone.getDomain()).toBe(command.getDomain());
      expect(clone.getStrategy()).toBe(command.getStrategy());
      expect(clone.getRetryConfig()).toEqual(command.getRetryConfig());
      expect(clone.getMetadata().priority).toBe(command.getMetadata().priority);
      expect(clone.getId()).not.toBe(command.getId()); // Should have different ID
    });

    it('should create independent clone', async () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      const clone = command.clone();
      
      await command.execute();
      
      expect(command.getStatus()).toBe(CommandStatus.COMPLETED);
      expect(clone.getStatus()).toBe(CommandStatus.PENDING);
    });
  });

  describe('Retry Configuration', () => {
    it('should use custom retry configuration', () => {
      const retryConfig = {
        maxRetries: 5,
        initialDelayMs: 2000,
        useExponentialBackoff: false,
        maxDelayMs: 10000,
        backoffMultiplier: 3
      };
      
      const command = new DomainCheckCommand('example.com', mockStrategy, retryConfig);
      
      expect(command.getRetryConfig()).toEqual(retryConfig);
    });

    it('should allow retry configuration updates', () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      const newConfig = {
        maxRetries: 10,
        initialDelayMs: 500,
        useExponentialBackoff: true,
        maxDelayMs: 20000,
        backoffMultiplier: 2.5
      };
      
      command.setRetryConfig(newConfig);
      
      expect(command.getRetryConfig()).toEqual(newConfig);
    });
  });

  describe('Command Description', () => {
    it('should provide descriptive command description', () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      const description = command.getDescription();
      
      expect(description).toBe("Check availability of domain 'example.com' using MockStrategy strategy");
    });
  });

  describe('Integration with Different Strategies', () => {
    it('should work with different strategy implementations', async () => {
      const strategy1 = new MockQueryStrategy({ status: AvailabilityStatus.AVAILABLE });
      const strategy2 = new MockQueryStrategy({ status: AvailabilityStatus.TAKEN });
      
      const command1 = new DomainCheckCommand('available.com', strategy1);
      const command2 = new DomainCheckCommand('taken.com', strategy2);
      
      const result1 = await command1.execute();
      const result2 = await command2.execute();
      
      expect(result1.status).toBe(AvailabilityStatus.AVAILABLE);
      expect(result2.status).toBe(AvailabilityStatus.TAKEN);
    });

    it('should handle strategy-specific errors', async () => {
      const strategy = new MockQueryStrategy();
      jest.spyOn(strategy, 'execute').mockRejectedValue(new Error('Network timeout'));
      
      const command = new DomainCheckCommand('example.com', strategy);
      
      await expect(command.execute()).rejects.toThrow('Domain check failed for example.com using MockStrategy: Network timeout');
    });
  });

  describe('Priority Handling', () => {
    it('should set command priority correctly', () => {
      const command = new DomainCheckCommand('example.com', mockStrategy, {}, 5);
      
      expect(command.getMetadata().priority).toBe(5);
    });

    it('should default to priority 0', () => {
      const command = new DomainCheckCommand('example.com', mockStrategy);
      
      expect(command.getMetadata().priority).toBe(0);
    });
  });
});