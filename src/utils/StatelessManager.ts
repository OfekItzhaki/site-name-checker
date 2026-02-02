/**
 * Stateless Manager - Ensures no data persistence in the application
 * Implements privacy-focused, stateless design with no data storage
 */
export class StatelessManager {
  private static instance: StatelessManager;
  private readonly STORAGE_KEYS_TO_CLEAR = [
    'domainResults',
    'searchHistory',
    'userPreferences',
    'cachedQueries',
    'sessionData',
    'domainChecker',
    'queryCache',
    // Authentication-related keys
    'authToken',
    'accessToken',
    'refreshToken',
    'sessionToken',
    'userToken',
    'jwt',
    'bearer',
    'apiKey',
    'credentials',
    'loginData',
    'userSession',
    'authData'
  ];

  private constructor() {
    this.ensureCleanState();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): StatelessManager {
    if (!StatelessManager.instance) {
      StatelessManager.instance = new StatelessManager();
    }
    return StatelessManager.instance;
  }

  /**
   * Check if a storage key should be cleared based on domain/auth-related terms
   */
  private shouldClearKey(key: string): boolean {
    const termsToCheck = [
      'domain', 'query', 'result', 'search',
      'auth', 'token', 'login', 'session', 'credential'
    ];
    
    const lowerKey = key.toLowerCase();
    return termsToCheck.some(term => lowerKey.includes(term));
  }

  /**
   * Ensure completely clean state - no data persistence
   */
  public ensureCleanState(): void {
    this.clearAllStorage();
    this.preventStorageUsage();
    this.clearMemoryCache();
  }

  /**
   * Clear all browser storage (localStorage, sessionStorage, cookies)
   */
  private clearAllStorage(): void {
    try {
      // Clear localStorage
      if (typeof localStorage !== 'undefined') {
        this.STORAGE_KEYS_TO_CLEAR.forEach(key => {
          localStorage.removeItem(key);
        });
        
        // Also clear any keys that might contain domain-related or auth data
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && this.shouldClearKey(key)) {
            localStorage.removeItem(key);
          }
        }
      }

      // Clear sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        this.STORAGE_KEYS_TO_CLEAR.forEach(key => {
          sessionStorage.removeItem(key);
        });
        
        // Also clear any keys that might contain domain-related or auth data
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key && this.shouldClearKey(key)) {
            sessionStorage.removeItem(key);
          }
        }
      }

      // Clear any application-specific cookies
      this.clearApplicationCookies();
      
    } catch (error) {
      console.warn('Storage clearing failed (may be in private browsing mode):', error);
    }
  }

  /**
   * Clear application-specific cookies
   */
  private clearApplicationCookies(): void {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      
      cookies.forEach(cookie => {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        
        // Clear cookies that might contain application data
        if (name.includes('domain') || name.includes('query') || name.includes('result') || 
            name.includes('checker') || name.includes('search') ||
            name.includes('auth') || name.includes('token') || name.includes('login') ||
            name.includes('session') || name.includes('credential')) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        }
      });
    }
  }

  /**
   * Prevent accidental storage usage by overriding storage methods
   */
  private preventStorageUsage(): void {
    if (typeof window !== 'undefined') {
      // Create warning functions for accidental storage usage
      const storageWarning = (operation: string, storage: string) => {
        console.warn(`Attempted to use ${storage}.${operation}() - Application is stateless and should not persist data`);
      };

      // Override localStorage methods with warnings (in development)
      if (process.env['NODE_ENV'] === 'development') {
        const originalLocalStorageSetItem = localStorage.setItem;
        localStorage.setItem = function(key: string, value: string) {
          if (key.includes('domain') || key.includes('query') || key.includes('result')) {
            storageWarning('setItem', 'localStorage');
            return;
          }
          return originalLocalStorageSetItem.call(this, key, value);
        };

        const originalSessionStorageSetItem = sessionStorage.setItem;
        sessionStorage.setItem = function(key: string, value: string) {
          if (key.includes('domain') || key.includes('query') || key.includes('result')) {
            storageWarning('setItem', 'sessionStorage');
            return;
          }
          return originalSessionStorageSetItem.call(this, key, value);
        };
      }
    }
  }

  /**
   * Clear any in-memory caches
   */
  private clearMemoryCache(): void {
    // Clear any global variables that might cache data
    if (typeof window !== 'undefined') {
      // Remove any global cache objects
      delete (window as any).domainCache;
      delete (window as any).queryCache;
      delete (window as any).resultCache;
      delete (window as any).searchHistory;
    }
  }

  /**
   * Verify no data is persisted
   * @returns Object with verification results
   */
  public verifyStatelessOperation(): {
    isStateless: boolean;
    issues: string[];
    storageUsage: {
      localStorage: number;
      sessionStorage: number;
      cookies: number;
    };
  } {
    const issues: string[] = [];
    let localStorageCount = 0;
    let sessionStorageCount = 0;
    let cookieCount = 0;

    try {
      // Check localStorage
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && this.shouldClearKey(key)) {
            localStorageCount++;
            issues.push(`Found localStorage key: ${key}`);
          }
        }
      }

      // Check sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && this.shouldClearKey(key)) {
            sessionStorageCount++;
            issues.push(`Found sessionStorage key: ${key}`);
          }
        }
      }

      // Check cookies
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';');
        cookies.forEach(cookie => {
          const cookieParts = cookie.split('=');
          if (cookieParts.length > 0 && cookieParts[0]) {
            const name = cookieParts[0].trim();
            if (this.shouldClearKey(name)) {
              cookieCount++;
              issues.push(`Found cookie: ${name}`);
            }
          }
        });
      }

      // Check global variables
      if (typeof window !== 'undefined') {
        const globalVars = ['domainCache', 'queryCache', 'resultCache', 'searchHistory'];
        globalVars.forEach(varName => {
          if ((window as any)[varName]) {
            issues.push(`Found global variable: ${varName}`);
          }
        });
      }

    } catch (error) {
      issues.push(`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isStateless: issues.length === 0,
      issues,
      storageUsage: {
        localStorage: localStorageCount,
        sessionStorage: sessionStorageCount,
        cookies: cookieCount
      }
    };
  }

  /**
   * Handle page refresh - ensure clean state
   */
  public handlePageRefresh(): void {
    this.ensureCleanState();
  }

  /**
   * Handle page unload - clean up any remaining data
   */
  public handlePageUnload(): void {
    this.ensureCleanState();
  }

  /**
   * Get privacy compliance status
   */
  public getPrivacyComplianceStatus(): {
    compliant: boolean;
    features: {
      noDataPersistence: boolean;
      noUserTracking: boolean;
      noSessionStorage: boolean;
      noCookies: boolean;
      cleanStateOnRefresh: boolean;
    };
  } {
    const verification = this.verifyStatelessOperation();
    
    return {
      compliant: verification.isStateless,
      features: {
        noDataPersistence: verification.storageUsage.localStorage === 0,
        noUserTracking: true, // Application doesn't track users
        noSessionStorage: verification.storageUsage.sessionStorage === 0,
        noCookies: verification.storageUsage.cookies === 0,
        cleanStateOnRefresh: true // Implemented in this class
      }
    };
  }

  /**
   * Initialize stateless operation
   */
  public static initialize(): void {
    const manager = StatelessManager.getInstance();
    
    // Set up event listeners for page lifecycle
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        manager.handlePageUnload();
      });

      window.addEventListener('load', () => {
        manager.handlePageRefresh();
      });

      // Also clean state on visibility change (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          manager.ensureCleanState();
        }
      });
    }
  }
}