/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are a CI failure — see docs/dependency-rules.md',
      from: {},
      to: { circular: true },
    },
    {
      name: 'packages-cannot-import-apps-or-services',
      severity: 'error',
      comment: 'Shared packages must never depend on apps/ or services/ (inward-only graph).',
      from: { path: '^packages' },
      to: { path: '^(apps|services)' },
    },
    {
      name: 'services-cannot-import-other-services',
      severity: 'error',
      comment:
        'Cross-service calls must go through event-bus or an internal HTTP contract, never a direct source import. (Imports within the same service directory are allowed via the $1 backreference.)',
      from: { path: '^services/([^/]+)/' },
      to: { path: '^services/([^/]+)/', pathNot: '^services/$1/' },
    },
    {
      name: 'apps-cannot-import-services',
      severity: 'error',
      comment:
        'Client-facing apps only reach services through apps/gateway or apps/voice-gateway over the network, never by importing service source directly.',
      from: { path: '^apps/(web|mobile|gateway|widget)' },
      to: { path: '^services' },
    },
    {
      name: 'client-apps-cannot-import-server-only-packages',
      severity: 'error',
      comment:
        'Web/Mobile must go through packages/sdk — they must never bundle DB/queue/vector-store clients.',
      from: { path: '^apps/(web|mobile)' },
      to: { path: '^packages/(database|redis-client|qdrant-client|ai-sdk)' },
    },
    {
      name: 'shared-types-has-zero-internal-deps',
      severity: 'error',
      comment: 'Layer 0 must never depend on any other internal package.',
      from: { path: '^packages/shared-types' },
      to: { path: '^packages/(?!shared-types)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require'] },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
