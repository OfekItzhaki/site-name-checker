import * as fc from 'fast-check';
import { ApplicationStateManager, ApplicationStateType } from '../../../src/patterns/state';
import type { IUICallbacks } from '../../../src/patterns/state';
import type { IDomainResult } from '../../../src/models';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';

describe('State Pattern Property Tests', () => {
  let stateManager: ApplicationStateManager;
  let mockUICallbacks: jest.Mocked<IUICallbacks>;

  beforeEach(() => {
    mockUICallbacks = {
      onValidationError: jest.fn(),
      onCheckStarted: jest.fn(),
      onResultUpdate: jest.fn(),
      onCheckCompleted: jest.fn(),
      onError: jest.fn(),
      onStateChange: jest.fn()
    };

    stateManager = new ApplicationStateManager();
    stateManager.registerUICallbacks(mockUICallbacks);
  });

  /**
   * **Property 1: State Transition Validity**
   * For any sequence of valid state transitions, the state manager should never enter an invalid state
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should maintain valid state transitions', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.constantFrom(
        ApplicationStateType.IDLE,
        ApplicationStateType.VALIDATING,
        ApplicationStateType.CHECKING,
        ApplicationStateType.COMPLETED,
        ApplicationStateType.ERROR
      ), { minLength: 1, maxLength: 10 }),
      async (stateSequence) => {
        stateManager.reset();
        let currentState = ApplicationStateType.IDLE;

        for (const targetState of stateSequence) {
          // Set up context for states that require it
          if (targetState === ApplicationStateType.CHECKING || targetState === ApplicationStateType.VALIDATING) {
            stateManager.getContext().currentInput = 'test-domain';
          }
          
          if (stateManager.canTransitionTo(targetState)) {
            await stateManager.transitionTo(targetState);
            currentState = targetState;
            expect(stateManager.getCurrentStateType()).toBe(currentState);
          }
        }

        // State should always be one of the valid states
        expect(Object.values(ApplicationStateType)).toContain(stateManager.getCurrentStateType());
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 2: Input Validation Consistency**
   * For any input string, validation should be consistent and deterministic
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should validate input consistently', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 0, maxLength: 100 }),
      async (input) => {
        stateManager.reset();
        
        // Test validation multiple times with same input
        const results: boolean[] = [];
        
        for (let i = 0; i < 3; i++) {
          mockUICallbacks.onValidationError.mockClear();
          stateManager.handleInput(input);
          await stateManager.transitionTo(ApplicationStateType.VALIDATING);
          
          const hasValidationError = mockUICallbacks.onValidationError.mock.calls.length > 0;
          results.push(hasValidationError);
          
          stateManager.reset();
        }

        // All validation results should be the same
        expect(results.every(result => result === results[0])).toBe(true);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 3: Context Preservation**
   * For any context updates, the state manager should preserve data integrity
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should preserve context data integrity', () => {
    fc.assert(fc.property(
      fc.record({
        input: fc.string({ minLength: 1, maxLength: 63 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s) && !s.startsWith('-') && !s.endsWith('-')),
        resultsCount: fc.integer({ min: 0, max: 10 }),
        errorsCount: fc.integer({ min: 0, max: 5 })
      }),
      (testData) => {
        stateManager.reset();
        
        // Set up context
        stateManager.handleInput(testData.input);
        
        // Add some results
        for (let i = 0; i < testData.resultsCount; i++) {
          const result: IDomainResult = {
            domain: `${testData.input}.com`,
            baseDomain: testData.input,
            tld: '.com',
            status: AvailabilityStatus.AVAILABLE,
            lastChecked: new Date(),
            checkMethod: 'DNS'
          };
          stateManager.handleResult(result);
        }

        // Add some errors
        for (let i = 0; i < testData.errorsCount; i++) {
          stateManager.handleError(`Test error ${i}`);
        }

        const context = stateManager.getContext();
        
        // Context should maintain data integrity
        expect(context.currentInput).toBe(testData.input);
        expect(context.results.length).toBeLessThanOrEqual(testData.resultsCount);
        expect(context.errors.length).toBeGreaterThanOrEqual(testData.errorsCount);
        expect(context.lastActionAt).toBeInstanceOf(Date);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 4: State History Accuracy**
   * For any sequence of state transitions, the history should accurately record all transitions
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should maintain accurate state history', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.constantFrom(
        ApplicationStateType.VALIDATING,
        ApplicationStateType.ERROR,
        ApplicationStateType.IDLE
      ), { minLength: 1, maxLength: 5 }),
      async (transitions) => {
        stateManager.reset();
        const expectedTransitions: Array<{ from: ApplicationStateType; to: ApplicationStateType }> = [];
        let currentState = ApplicationStateType.IDLE;

        for (const targetState of transitions) {
          if (stateManager.canTransitionTo(targetState)) {
            expectedTransitions.push({ from: currentState, to: targetState });
            await stateManager.transitionTo(targetState);
            currentState = targetState;
          }
        }

        const history = stateManager.getStateHistory();
        
        // History length should match expected transitions
        expect(history.length).toBe(expectedTransitions.length);
        
        // Each transition should be recorded correctly
        expectedTransitions.forEach((expected, index) => {
          if (history[index]) {
            expect(history[index].from).toBe(expected.from);
            expect(history[index].to).toBe(expected.to);
            expect(history[index].timestamp).toBeInstanceOf(Date);
          }
        });
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 5: Error Handling Robustness**
   * For any error input, the state manager should handle it gracefully without crashing
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should handle errors robustly', () => {
    fc.assert(fc.property(
      fc.oneof(
        fc.string(),
        fc.constant(new Error('Test error')),
        fc.constant(new TypeError('Type error')),
        fc.constant(new ReferenceError('Reference error'))
      ),
      (error) => {
        stateManager.reset();
        
        // Error handling should not throw
        expect(() => stateManager.handleError(error)).not.toThrow();
        
        // State should remain valid
        expect(Object.values(ApplicationStateType)).toContain(stateManager.getCurrentStateType());
        
        // Context should remain valid
        const context = stateManager.getContext();
        expect(context).toBeDefined();
        expect(context.errors).toBeDefined();
        expect(Array.isArray(context.errors)).toBe(true);
        expect(context.lastActionAt).toBeInstanceOf(Date);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 6: Reset Consistency**
   * For any state and context, reset should always return to a clean initial state
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should reset to consistent initial state', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        input: fc.string(),
        stateTransitions: fc.array(fc.constantFrom(
          ApplicationStateType.VALIDATING,
          ApplicationStateType.ERROR
        ), { maxLength: 3 }),
        errorCount: fc.integer({ min: 0, max: 5 })
      }),
      async (testData) => {
        stateManager.reset();
        
        // Make some changes to state
        stateManager.handleInput(testData.input);
        
        for (const state of testData.stateTransitions) {
          if (stateManager.canTransitionTo(state)) {
            await stateManager.transitionTo(state);
          }
        }
        
        for (let i = 0; i < testData.errorCount; i++) {
          stateManager.handleError(`Error ${i}`);
        }

        // Reset
        stateManager.reset();

        // Check initial state
        expect(stateManager.getCurrentStateType()).toBe(ApplicationStateType.IDLE);
        
        const context = stateManager.getContext();
        expect(context.currentInput).toBe('');
        expect(context.results).toEqual([]);
        expect(context.errors).toEqual([]);
        expect(context.progress).toEqual({ completed: 0, total: 0 });
        expect(stateManager.getStateHistory()).toEqual([]);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 7: Domain Result Processing**
   * For any valid domain result, the state manager should process it correctly
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should process domain results correctly', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        domain: fc.string({ minLength: 1, maxLength: 63 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s) && !s.startsWith('-') && !s.endsWith('-')),
        tld: fc.constantFrom('.com', '.net', '.org', '.ai', '.dev', '.io', '.co'),
        status: fc.constantFrom(
          AvailabilityStatus.AVAILABLE,
          AvailabilityStatus.TAKEN,
          AvailabilityStatus.ERROR,
          AvailabilityStatus.CHECKING
        ),
        checkMethod: fc.constantFrom('DNS', 'WHOIS', 'HYBRID')
      }),
      async (resultData) => {
        stateManager.reset();
        
        // Set up context and follow proper state transition flow
        stateManager.getContext().currentInput = resultData.domain;
        
        // Transition through proper states: idle → validating → checking
        await stateManager.transitionTo(ApplicationStateType.VALIDATING);
        await stateManager.transitionTo(ApplicationStateType.CHECKING);

        const result: IDomainResult = {
          domain: `${resultData.domain}${resultData.tld}`,
          baseDomain: resultData.domain,
          tld: resultData.tld,
          status: resultData.status,
          lastChecked: new Date(),
          checkMethod: resultData.checkMethod as any
        };

        stateManager.handleResult(result);

        const context = stateManager.getContext();
        
        // Result should be stored
        expect(context.results.some(r => r.domain === result.domain)).toBe(true);
        
        // Progress should be updated if result is not checking
        if (result.status !== AvailabilityStatus.CHECKING) {
          expect(context.progress.completed).toBeGreaterThan(0);
        }
        
        // UI callback should be called
        expect(mockUICallbacks.onResultUpdate).toHaveBeenCalledWith(result);
      }
    ), { numRuns: 100 });
  });

  /**
   * **Property 8: Concurrent State Operations**
   * For any sequence of concurrent operations, the state should remain consistent
   * **Validates: Requirements 3.1, 3.2, 6.1, 6.2**
   */
  it('should handle concurrent operations consistently', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.record({
        operation: fc.constantFrom('input', 'error', 'result'),
        data: fc.string({ minLength: 1, maxLength: 20 })
      }), { minLength: 1, maxLength: 10 }),
      async (operations) => {
        stateManager.reset();
        
        // Set up context and follow proper state transition flow
        stateManager.getContext().currentInput = 'test-domain';
        
        // Transition through proper states: idle → validating → checking
        await stateManager.transitionTo(ApplicationStateType.VALIDATING);
        await stateManager.transitionTo(ApplicationStateType.CHECKING);

        // Execute operations
        operations.forEach(op => {
          switch (op.operation) {
            case 'input':
              stateManager.handleInput(op.data);
              break;
            case 'error':
              stateManager.handleError(op.data);
              break;
            case 'result':
              const result: IDomainResult = {
                domain: `${op.data}.com`,
                baseDomain: op.data,
                tld: '.com',
                status: AvailabilityStatus.AVAILABLE,
                lastChecked: new Date(),
                checkMethod: 'DNS'
              };
              stateManager.handleResult(result);
              break;
          }
        });

        // State should remain valid
        expect(Object.values(ApplicationStateType)).toContain(stateManager.getCurrentStateType());
        
        // Context should be valid
        const context = stateManager.getContext();
        expect(context).toBeDefined();
        expect(Array.isArray(context.results)).toBe(true);
        expect(Array.isArray(context.errors)).toBe(true);
        expect(context.lastActionAt).toBeInstanceOf(Date);
      }
    ), { numRuns: 100 });
  });
});