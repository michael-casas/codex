#!/usr/bin/env -S codex-workflows
import {
  agent,
  artifact,
  defineWorkflow,
  parallel,
  phase,
} from '@codex/workflows';

interface AuditInput {
  auditTopic: string;
  researchNonce: string;
  auditNonce: string;
}

interface LaneOutput {
  lane: 'research' | 'audit';
  finding: string;
  evidence: string;
  inputNonce: string;
}

interface AuditDecision {
  status: 'complete';
  schemaEnforced: true;
  researchFinding: string;
  auditFinding: string;
  researchNonce: string;
  auditNonce: string;
  summary: string;
}

export default defineWorkflow<AuditInput, unknown>({
  id: 'external-audit-attempt-3',
  version: 1,
  description:
    'Independent L3 dogfood for literal-shebang Luna-only typed workflow dataflow.',
  maxConcurrency: 2,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['auditTopic', 'researchNonce', 'auditNonce'],
    properties: {
      auditTopic: { type: 'string', minLength: 1 },
      researchNonce: { type: 'string', minLength: 1 },
      auditNonce: { type: 'string', minLength: 1 },
    },
  },
  async run(input) {
    const results = await phase('Independent research and audit', () =>
      parallel({
        research: () =>
          agent<LaneOutput, unknown>({
            label: 'attempt-3-research',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt:
              'Do not use tools, browse, run commands, or modify files. Return only the requested strict JSON. Provide one concise finding that the supplied topic requires literal-shebang end-to-end evidence. Copy the supplied nonce exactly.',
            input: {
              lane: 'research',
              topic: input.auditTopic,
              nonce: input.researchNonce,
            },
            outputSchema: {
              type: 'object',
              additionalProperties: false,
              required: ['lane', 'finding', 'evidence', 'inputNonce'],
              properties: {
                lane: { type: 'string', const: 'research' },
                finding: { type: 'string', minLength: 12 },
                evidence: { type: 'string', const: 'A3-RESEARCH-EVIDENCE' },
                inputNonce: { type: 'string', const: input.researchNonce },
              },
            },
          }),
        audit: () =>
          agent<LaneOutput, unknown>({
            label: 'attempt-3-audit',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt:
              'Do not use tools, browse, run commands, or modify files. Return only the requested strict JSON. Provide one concise finding that the supplied topic requires journal, schema, artifact, and cleanup verification. Copy the supplied nonce exactly.',
            input: {
              lane: 'audit',
              topic: input.auditTopic,
              nonce: input.auditNonce,
            },
            outputSchema: {
              type: 'object',
              additionalProperties: false,
              required: ['lane', 'finding', 'evidence', 'inputNonce'],
              properties: {
                lane: { type: 'string', const: 'audit' },
                finding: { type: 'string', minLength: 12 },
                evidence: { type: 'string', const: 'A3-AUDIT-EVIDENCE' },
                inputNonce: { type: 'string', const: input.auditNonce },
              },
            },
          }),
      }),
    );

    const decision = await phase('Strict consolidation', () =>
      agent<AuditDecision, typeof results>({
        label: 'attempt-3-consolidator',
        model: 'gpt-5.6-luna',
        reasoning: 'medium',
        prompt:
          'Do not use tools, browse, run commands, or modify files. Return only the requested strict JSON. Copy the exact research finding, audit finding, and both nonces from the supplied typed workflow input. Set status to complete and schemaEnforced to true. Add one concise synthesis sentence.',
        input: results,
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          required: [
            'status',
            'schemaEnforced',
            'researchFinding',
            'auditFinding',
            'researchNonce',
            'auditNonce',
            'summary',
          ],
          properties: {
            status: { type: 'string', const: 'complete' },
            schemaEnforced: { type: 'boolean', const: true },
            researchFinding: { type: 'string', minLength: 12 },
            auditFinding: { type: 'string', minLength: 12 },
            researchNonce: { type: 'string', const: input.researchNonce },
            auditNonce: { type: 'string', const: input.auditNonce },
            summary: { type: 'string', minLength: 12 },
          },
        },
      }),
    );

    const saved = await artifact('external-audit-attempt-3-result.json', {
      value: decision,
      mediaType: 'application/json',
    });
    return { research: results, decision, artifact: saved };
  },
});
