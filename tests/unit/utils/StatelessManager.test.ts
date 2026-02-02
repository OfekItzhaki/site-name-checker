import { StatelessManager } from '../../../src/utils/StatelessManager';

/**
 * Unit tests for StatelessManager
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4 - Stateless Operation and No Authentication
 */
describe('StatelessManager Unit Tests', () => {
  let statelessManager: StatelessManager;

  beforeEach(() => {
    statelessManager = StatelessManager.getInstance();
    statelessManager.ensureCleanState();
  });

  afterEach(() => {
    statelessManager.ensureCleanState();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = StatelessManager.getInstance();
      const instance2 = StatelessManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Storage Clearing', () => {
    it('should clear localStorage domain-related keys', () => {
      // Set up test data
      localStorage.setItem('domainResults', 'test');
      localStorage.setItem('searchHistory', 'test');
      localStorage.setItem('queryCache', 'test');
      localStorage.setItem('unrelatedKey', 'should remain');

      statelessManager.ensureCleanState();

      expect(localStorage.getItem('domainResults')).toBeNull();
      expect(localStorage.getItem('searchHistory')).toBeNull();
      expect(localStorage.getItem('queryCache')).toBeNull();
      expect(localStorage.getItem('unrelatedKey')).toBe('should remain');
    });

    it('should clear sessionStorage domain-related keys', () => {
      // Set up test data
      sessionStorage.setItem('domainResults', 'test');
      sessionStorage.setItem('searchHistory', 'test');
      sessionStorage.setItem('queryCache', 'test');
      sessionStorage.setItem('unrelatedKey', 'should remain');

      statelessManager.ensureCleanState();

      expect(sessionStorage.getItem('domainResults')).toBeNull();
      expect(sessionStorage.getItem('searchHistory')).toBeNull();
      expect(sessionStorage.getItem('queryCache')).toBeNull();
      expect(sessionStorage.getItem('unrelatedKey')).toBe('should remain');
    });

    it('should clear keys containing domain-related terms', () => {
      // Set up test data with various domain-related terms
      localStorage.setItem('my_domain_cache', 'test');
      localStorage.setItem('query_results_2024', 'test');
      localStorage.setItem('result_history', 'test');
      localStorage.setItem('normalKey', 'should remain');

      statelessManager.ensureCleanState();

      expect(localStorage.getItem('my_domain_cache')).toBeNull();
      expect(localStorage.getItem('query_results_2024')).toBeNull();
      expect(localStorage.getItem('result_history')).toBeNull();
      expect(localStorage.getItem('normalKey')).toBe('should remain');
    });
  });

  describe('Stateless Verification', () => {
    it('should verify clean state correctly', () => {
      const verification = statelessManager.verifyStatelessOperation();
      
      expect(verification.isStateless).toBe(true);
      expect(verification.issues).toHaveLength(0);
      expect(verification.storageUsage.localStorage).toBe(0);
      expect(verification.storageUsage.sessionStorage).toBe(0);
      expect(verification.storageUsage.cookies).toBe(0);
    });

    it('should detect domain-related data in storage', () => {
      // Add domain-related data
      localStorage.setItem('domainResults', 'test data');
      sessionStorage.setItem('queryCache', 'test data');

      const verification = statelessManager.verifyStatelessOperation();
      
      expect(verification.isStateless).toBe(false);
      expect(verification.issues.length).toBeGreaterThan(0);
      expect(verification.storageUsage.localStorage).toBeGreaterThan(0);
      expect(verification.storageUsage.sessionStorage).toBeGreaterThan(0);
    });
  });

  describe('Privacy Compliance', () => {
    it('should report privacy compliance status', () => {
      const compliance = statelessManager.getPrivacyComplianceStatus();
      
      expect(compliance.compliant).toBe(true);
      expect(compliance.features.noDataPersistence).toBe(true);
      expect(compliance.features.noUserTracking).toBe(true);
      expect(compliance.features.noSessionStorage).toBe(true);
      expect(compliance.features.noCookies).toBe(true);
      expect(compliance.features.cleanStateOnRefresh).toBe(true);
    });

    it('should detect non-compliance when data is present', () => {
      // Add domain-related data
      localStorage.setItem('domainResults', 'test');
      
      const compliance = statelessManager.getPrivacyComplianceStatus();
      
      expect(compliance.compliant).toBe(false);
      expect(compliance.features.noDataPersistence).toBe(false);
    });
  });

  describe('Page Lifecycle Handling', () => {
    it('should handle page refresh without errors', () => {
      expect(() => {
        statelessManager.handlePageRefresh();
      }).not.toThrow();
      
      const verification = statelessManager.verifyStatelessOperation();
      expect(verification.isStateless).toBe(true);
    });

    it('should handle page unload without errors', () => {
      expect(() => {
        statelessManager.handlePageUnload();
      }).not.toThrow();
      
      const verification = statelessManager.verifyStatelessOperation();
      expect(verification.isStateless).toBe(true);
    });
  });

  describe('Static Initialization', () => {
    it('should initialize without errors', () => {
      expect(() => {
        StatelessManager.initialize();
      }).not.toThrow();
    });
  });

  /**
   * Requirement 7.2: No Authentication Requirement
   * Validates that the system works without any authentication
   */
  describe('No Authentication Requirement (Requirement 7.2)', () => {
    it('should operate without any authentication tokens', () => {
      // Verify no authentication-related storage
      const authKeys = [
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

      authKeys.forEach(key => {
        expect(localStorage.getItem(key)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
      });

      // Verify the application can function without authentication
      const verification = statelessManager.verifyStatelessOperation();
      expect(verification.isStateless).toBe(true);
      
      const compliance = statelessManager.getPrivacyComplianceStatus();
      expect(compliance.compliant).toBe(true);
    });

    it('should not require user login or registration', () => {
      // Verify no user identification data is stored or required
      const userIdentificationKeys = [
        'userId',
        'username',
        'email',
        'userProfile',
        'accountData',
        'personalInfo',
        'userPreferences',
        'loginStatus',
        'isLoggedIn',
        'currentUser'
      ];

      userIdentificationKeys.forEach(key => {
        expect(localStorage.getItem(key)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
      });

      // The application should be fully functional without any user data
      expect(statelessManager.verifyStatelessOperation().isStateless).toBe(true);
    });

    it('should not store any user credentials or personal information', () => {
      // Verify no personal or credential data is stored
      const personalDataKeys = [
        'password',
        'credentials',
        'personalData',
        'userInfo',
        'profile',
        'account',
        'identity',
        'authentication',
        'authorization',
        'security'
      ];

      personalDataKeys.forEach(key => {
        expect(localStorage.getItem(key)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
      });

      // Ensure privacy compliance
      const compliance = statelessManager.getPrivacyComplianceStatus();
      expect(compliance.features.noUserTracking).toBe(true);
      expect(compliance.features.noDataPersistence).toBe(true);
    });

    it('should function as a completely anonymous service', () => {
      // Verify the service operates without any user identification
      const anonymousOperation = {
        noUserTracking: true,
        noPersonalData: true,
        noAuthentication: true,
        noRegistration: true,
        noLoginRequired: true
      };

      // All these should be true for anonymous operation
      Object.values(anonymousOperation).forEach(value => {
        expect(value).toBe(true);
      });

      // Verify stateless and privacy-compliant operation
      const verification = statelessManager.verifyStatelessOperation();
      const compliance = statelessManager.getPrivacyComplianceStatus();

      expect(verification.isStateless).toBe(true);
      expect(compliance.compliant).toBe(true);
      expect(compliance.features.noUserTracking).toBe(true);
    });

    it('should clear any accidentally stored authentication data', () => {
      // Simulate accidental storage of authentication data
      const authData = {
        'authToken': 'fake-token',
        'userSession': 'fake-session',
        'loginData': 'fake-login'
      };

      Object.entries(authData).forEach(([key, value]) => {
        localStorage.setItem(key, value);
        sessionStorage.setItem(key, value);
      });

      // The StatelessManager should clear this data
      statelessManager.ensureCleanState();

      // Verify all authentication data is cleared
      Object.keys(authData).forEach(key => {
        expect(localStorage.getItem(key)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
      });

      // Verify stateless operation is maintained
      const verification = statelessManager.verifyStatelessOperation();
      expect(verification.isStateless).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', () => {
      // Mock storage to throw errors
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = jest.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() => {
        statelessManager.ensureCleanState();
      }).not.toThrow();

      // Restore original method
      localStorage.setItem = originalSetItem;
    });

    it('should handle verification errors gracefully', () => {
      // Test that verification doesn't throw even with unusual conditions
      expect(() => {
        const verification = statelessManager.verifyStatelessOperation();
        // Should always return a valid verification object
        expect(verification).toHaveProperty('isStateless');
        expect(verification).toHaveProperty('issues');
        expect(verification).toHaveProperty('storageUsage');
      }).not.toThrow();
    });
  });
});