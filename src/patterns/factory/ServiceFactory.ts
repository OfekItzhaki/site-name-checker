import type { IServiceFactory, IQueryService, IServiceConfig } from './IServiceFactory';
import { DNSLookupService } from '../../services/DNSLookupService';
import { WHOISQueryService } from '../../services/WHOISQueryService';
import { HybridQueryService } from '../../services/HybridQueryService';

/**
 * Service Factory implementation for creating domain query services
 * Implements the Factory pattern to create appropriate query services based on requirements
 */
export class ServiceFactory implements IServiceFactory {
  private defaultConfig: IServiceConfig;
  private serviceInstances: Map<string, IQueryService> = new Map();
  private enableCaching: boolean;

  constructor(defaultConfig?: Partial<IServiceConfig>, enableCaching: boolean = true) {
    this.defaultConfig = {
      timeoutMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
      useExponentialBackoff: true,
      ...defaultConfig
    };
    this.enableCaching = enableCaching;
  }

  /**
   * Create a DNS lookup service
   * @param config - Optional service configuration
   * @returns DNS query service instance
   */
  createDNSService(config?: Partial<IServiceConfig>): DNSLookupService {
    const finalConfig = { ...this.defaultConfig, ...config };
    const cacheKey = this.enableCaching ? `DNS_${this.getConfigHash(finalConfig)}` : null;
    
    if (cacheKey && this.serviceInstances.has(cacheKey)) {
      return this.serviceInstances.get(cacheKey)! as DNSLookupService;
    }
    
    const service = new DNSLookupService();
    
    // Always configure service with final config (defaults + overrides)
    service.setConfig({
      timeoutMs: finalConfig.timeoutMs !== undefined ? finalConfig.timeoutMs : 3000,
      maxRetries: finalConfig.maxRetries !== undefined ? finalConfig.maxRetries : 2,
      retryDelayMs: finalConfig.retryDelayMs !== undefined ? finalConfig.retryDelayMs : 500,
      useExponentialBackoff: finalConfig.useExponentialBackoff !== undefined ? finalConfig.useExponentialBackoff : false,
      priority: 1,
      enabled: true
    });
    
    if (cacheKey) {
      this.serviceInstances.set(cacheKey, service as any);
    }
    
    return service;
  }

  /**
   * Create a WHOIS query service
   * @param config - Optional service configuration
   * @returns WHOIS query service instance
   */
  createWHOISService(config?: Partial<IServiceConfig>): WHOISQueryService {
    const finalConfig = { ...this.defaultConfig, ...config };
    const cacheKey = this.enableCaching ? `WHOIS_${this.getConfigHash(finalConfig)}` : null;
    
    if (cacheKey && this.serviceInstances.has(cacheKey)) {
      return this.serviceInstances.get(cacheKey)! as WHOISQueryService;
    }
    
    const service = new WHOISQueryService();
    
    // Always configure service with final config (defaults + overrides)
    service.setConfig({
      timeoutMs: finalConfig.timeoutMs !== undefined ? finalConfig.timeoutMs : 3000,
      maxRetries: finalConfig.maxRetries !== undefined ? finalConfig.maxRetries : 2,
      retryDelayMs: finalConfig.retryDelayMs !== undefined ? finalConfig.retryDelayMs : 500,
      useExponentialBackoff: finalConfig.useExponentialBackoff !== undefined ? finalConfig.useExponentialBackoff : false,
      priority: 2,
      enabled: true
    });
    
    if (cacheKey) {
      this.serviceInstances.set(cacheKey, service as any);
    }
    
    return service;
  }

  /**
   * Create a hybrid service (DNS + WHOIS)
   * @param config - Optional service configuration
   * @returns Hybrid query service instance
   */
  createHybridService(config?: Partial<IServiceConfig>): HybridQueryService {
    const finalConfig = { ...this.defaultConfig, ...config };
    const cacheKey = this.enableCaching ? `HYBRID_${this.getConfigHash(finalConfig)}` : null;
    
    if (cacheKey && this.serviceInstances.has(cacheKey)) {
      return this.serviceInstances.get(cacheKey)! as HybridQueryService;
    }
    
    const service = new HybridQueryService();
    
    // Always configure service with final config (defaults + overrides)
    service.setConfig({
      timeoutMs: finalConfig.timeoutMs !== undefined ? finalConfig.timeoutMs : 3000,
      maxRetries: finalConfig.maxRetries !== undefined ? finalConfig.maxRetries : 2,
      retryDelayMs: finalConfig.retryDelayMs !== undefined ? finalConfig.retryDelayMs : 500,
      useExponentialBackoff: finalConfig.useExponentialBackoff !== undefined ? finalConfig.useExponentialBackoff : false,
      priority: 3,
      enabled: true
    });
    
    if (cacheKey) {
      this.serviceInstances.set(cacheKey, service as any);
    }
    
    return service;
  }

  /**
   * Get service by type
   * @param type - Service type to create
   * @param config - Optional service configuration
   * @returns Query service instance
   */
  getServiceByType(type: 'DNS' | 'WHOIS' | 'HYBRID', config?: Partial<IServiceConfig>): IQueryService {
    switch (type) {
      case 'DNS':
        return this.createDNSService(config);
      case 'WHOIS':
        return this.createWHOISService(config);
      case 'HYBRID':
        return this.createHybridService(config);
      default:
        throw new Error(`Unknown service type: ${type}`);
    }
  }

  /**
   * Configure default settings for all services
   * @param config - Default configuration to apply
   */
  setDefaultConfig(config: Partial<IServiceConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    
    // Clear cache when default config changes to ensure new instances use updated config
    if (this.enableCaching) {
      this.clearCache();
    }
  }

  /**
   * Get current default configuration
   * @returns Current default service configuration
   */
  getDefaultConfig(): IServiceConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Create service with custom configuration for specific domain/TLD
   * @param domain - Domain name to optimize for
   * @param baseType - Base service type to use
   * @returns Optimized service instance
   */
  createOptimizedService(domain: string, baseType: 'DNS' | 'WHOIS' | 'HYBRID' = 'HYBRID'): IQueryService {
    const optimizedConfig = this.getOptimizedConfig(domain);
    return this.getServiceByType(baseType, optimizedConfig);
  }

  /**
   * Get optimized configuration based on domain characteristics
   * @param domain - Domain to optimize for
   * @returns Optimized service configuration
   */
  private getOptimizedConfig(domain: string): Partial<IServiceConfig> {
    const tld = this.extractTLD(domain);
    const config: Partial<IServiceConfig> = {};
    
    // Optimize timeouts based on TLD characteristics
    switch (tld) {
      case '.com':
      case '.net':
      case '.org':
        // Common TLDs - use standard timeouts
        config.timeoutMs = 3000;
        config.maxRetries = 2;
        break;
      
      case '.ai':
      case '.dev':
      case '.io':
        // Premium TLDs - allow more time for accuracy
        config.timeoutMs = 8000;
        config.maxRetries = 3;
        config.retryDelayMs = 1500;
        break;
      
      case '.co':
        // Country code TLD - moderate timeout
        config.timeoutMs = 5000;
        config.maxRetries = 2;
        break;
      
      default:
        // Unknown TLD - use conservative settings
        config.timeoutMs = 6000;
        config.maxRetries = 3;
    }
    
    return config;
  }

  /**
   * Extract TLD from domain name
   * @param domain - Full domain name
   * @returns TLD portion
   */
  private extractTLD(domain: string): string {
    const lastDotIndex = domain.lastIndexOf('.');
    return lastDotIndex !== -1 ? domain.substring(lastDotIndex) : '';
  }

  /**
   * Generate a hash for service configuration to enable caching
   * @param config - Service configuration
   * @returns Configuration hash string
   */
  private getConfigHash(config: IServiceConfig): string {
    return JSON.stringify(config);
  }



  /**
   * Clear all cached service instances
   */
  clearCache(): void {
    this.serviceInstances.clear();
  }

  /**
   * Get cache statistics
   * @returns Cache usage information
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.serviceInstances.size,
      keys: Array.from(this.serviceInstances.keys())
    };
  }

  /**
   * Enable or disable service instance caching
   * @param enabled - Whether to enable caching
   */
  setCachingEnabled(enabled: boolean): void {
    this.enableCaching = enabled;
    if (!enabled) {
      this.clearCache();
    }
  }

  /**
   * Check if caching is enabled
   * @returns True if caching is enabled
   */
  isCachingEnabled(): boolean {
    return this.enableCaching;
  }

  /**
   * Create multiple services of different types with shared configuration
   * @param config - Shared configuration for all services
   * @returns Object containing all service types
   */
  createServiceSuite(config?: Partial<IServiceConfig>): {
    dns: IQueryService;
    whois: IQueryService;
    hybrid: IQueryService;
  } {
    return {
      dns: this.createDNSService(config),
      whois: this.createWHOISService(config),
      hybrid: this.createHybridService(config)
    };
  }

  /**
   * Dispose of all services and clear resources
   */
  dispose(): void {
    this.clearCache();
    this.serviceInstances.clear();
  }
}