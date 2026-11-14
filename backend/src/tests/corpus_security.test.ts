import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { config } from '../config.js';

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('Corpus Management Security & Authorization Suite', () => {
  const originalAdminKey = config.corpusAdminApiKey;

  beforeEach(() => {
    config.corpusAdminApiKey = 'test-secret-corpus-admin-token-12345';
  });

  afterEach(() => {
    config.corpusAdminApiKey = originalAdminKey;
  });

  it('rejects unauthenticated document indexing requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'unauth-doc-1',
        title: 'Unauthorized Document',
        authorOrSource: 'Attacker',
        url: 'https://example.com/unauth',
        text: 'This document was submitted without any authentication credentials.'
      })
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Missing corpus administration key/i);
  });

  it('rejects requests with invalid admin keys with 403', async () => {
    const res = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'wrong-token-abc'
      },
      body: JSON.stringify({
        id: 'wrong-key-doc',
        title: 'Tampered Document',
        authorOrSource: 'Attacker',
        url: 'https://example.com/tampered',
        text: 'This document was submitted with a fraudulent administration token.'
      })
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid corpus administration key/i);
  });

  it('returns 503 when CORPUS_ADMIN_KEY is not configured on the server', async () => {
    config.corpusAdminApiKey = '';

    const res = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'any-token'
      },
      body: JSON.stringify({
        id: 'unconfigured-doc',
        title: 'Doc',
        authorOrSource: 'Author',
        url: 'https://example.com/doc',
        text: 'This is sample text for corpus testing.'
      })
    });

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/Corpus administration is disabled/i);
  });

  it('allows document indexing with valid admin credentials (header: x-admin-key and Bearer)', async () => {
    const res = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'test-secret-corpus-admin-token-12345'
      },
      body: JSON.stringify({
        id: 'sec-doc-1',
        title: 'Security Analysis in Modern Web Services',
        authorOrSource: 'Dr. Jane Smith',
        url: 'https://example.edu/security-analysis',
        text: 'Information security principles require defense in depth and robust access controls across all service tiers.'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('indexed');
    expect(json.documentId).toBe('sec-doc-1');
  });

  it('rejects documents targeting private loopback or invalid protocols (SSRF mitigation)', async () => {
    const resLoopback = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret-corpus-admin-token-12345'
      },
      body: JSON.stringify({
        id: 'ssrf-doc-1',
        title: 'Loopback Target',
        authorOrSource: 'Tester',
        url: 'http://127.0.0.1/admin',
        text: 'Attempting to inject a document with loopback metadata.'
      })
    });

    expect(resLoopback.status).toBe(400);

    const resPrivateIp = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret-corpus-admin-token-12345'
      },
      body: JSON.stringify({
        id: 'ssrf-doc-2',
        title: 'Private Subnet Target',
        authorOrSource: 'Tester',
        url: 'http://192.168.1.50/secret',
        text: 'Attempting to inject a document with private subnet URL.'
      })
    });

    expect(resPrivateIp.status).toBe(400);
  });

  it('rejects oversized document text (> 50,000 characters)', async () => {
    const hugeText = 'A'.repeat(50001);

    const res = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'test-secret-corpus-admin-token-12345'
      },
      body: JSON.stringify({
        id: 'huge-doc-1',
        title: 'Huge Text Payload',
        authorOrSource: 'Tester',
        url: 'https://example.com/huge',
        text: hugeText
      })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/50,000 characters/i);
  });

  it('rejects duplicate document titles under conflicting IDs', async () => {
    // 1. Index first document
    await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'test-secret-corpus-admin-token-12345'
      },
      body: JSON.stringify({
        id: 'doc-original-1',
        title: 'Quantum Computing Fundamentals',
        authorOrSource: 'Prof. Miller',
        url: 'https://example.org/quantum',
        text: 'Superposition and entanglement are central phenomena in quantum mechanics.'
      })
    });

    // 2. Attempt indexing conflicting ID with identical title
    const resConflict = await fetch(`${baseUrl}/api/originality/corpus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'test-secret-corpus-admin-token-12345'
      },
      body: JSON.stringify({
        id: 'doc-conflict-2',
        title: 'Quantum Computing Fundamentals',
        authorOrSource: 'Another Author',
        url: 'https://example.org/quantum2',
        text: 'Different body text with duplicated title string.'
      })
    });

    expect(resConflict.status).toBe(409);
    const json = await resConflict.json();
    expect(json.error).toMatch(/already exists with ID/i);
  });

  it('provides protected audit logs of corpus mutations', async () => {
    const unauthAudit = await fetch(`${baseUrl}/api/originality/corpus/audit`);
    expect(unauthAudit.status).toBe(401);

    const authAudit = await fetch(`${baseUrl}/api/originality/corpus/audit`, {
      headers: {
        'x-admin-key': 'test-secret-corpus-admin-token-12345'
      }
    });

    expect(authAudit.status).toBe(200);
    const json = await authAudit.json();
    expect(Array.isArray(json.auditLogs)).toBe(true);
    expect(json.auditLogs.length).toBeGreaterThan(0);
  });
});
