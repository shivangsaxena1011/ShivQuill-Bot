import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { config, assertProductionReadiness, validateProviderConfiguration } from '../config.js';
import { executeLlmCompletion } from '../llm.js';

describe('Zero-Mock Policy & Provider Health Enforcement', () => {
  const originalEnv = config.env;
  const originalRequestType = config.requestType;

  afterEach(() => {
    config.env = originalEnv;
    config.requestType = originalRequestType;
  });

  it('strictly forbids MOCK execution in production environment', async () => {
    config.env = 'production';
    config.requestType = 'MOCK';

    await expect(
      executeLlmCompletion('system prompt', 'user prompt')
    ).rejects.toThrow(/ZERO-MOCK POLICY.*forbidden in production/i);
  });

  it('fails production readiness assertion when provider is MOCK or UNCONFIGURED', () => {
    config.env = 'production';
    config.requestType = 'MOCK';
    expect(() => assertProductionReadiness()).toThrow(/Production Assertion Failed/i);

    config.requestType = 'UNCONFIGURED';
    expect(() => assertProductionReadiness()).toThrow(/Production Assertion Failed/i);
  });

  it('strictly refuses to silently execute mock when provider is UNCONFIGURED', async () => {
    config.env = 'development';
    config.requestType = 'UNCONFIGURED';

    await expect(
      executeLlmCompletion('system prompt', 'user prompt')
    ).rejects.toThrow(/unconfigured mode.*configure a valid provider/i);
  });

  it('distinguishes mock simulation readiness from unconfigured state in provider validation', () => {
    config.env = 'development';
    config.requestType = 'MOCK';
    const mockVal = validateProviderConfiguration();
    expect(mockVal.ready).toBe(true);
    expect(mockVal.provider).toBe('MOCK');
    expect(mockVal.message).toMatch(/simulated MOCK mode/i);

    config.requestType = 'UNCONFIGURED';
    const unconfVal = validateProviderConfiguration();
    expect(unconfVal.ready).toBe(false);
    expect(unconfVal.provider).toBe('UNCONFIGURED');
    expect(unconfVal.message).toMatch(/No AI provider is configured/i);

    config.env = 'production';
    config.requestType = 'MOCK';
    const prodMockVal = validateProviderConfiguration();
    expect(prodMockVal.ready).toBe(false);
    expect(prodMockVal.message).toMatch(/CRITICAL SECURITY ERROR/i);
  });
});
