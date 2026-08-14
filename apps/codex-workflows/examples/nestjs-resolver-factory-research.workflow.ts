#!/usr/bin/env -S codex-workflows
import {
  agent,
  artifact,
  defineWorkflow,
  parallel,
  phase,
} from '@codex/workflows';

interface ResearchInput {
  proposalAudience: string;
  constraints: string[];
}

interface ResolverFactoryProposal {
  proposal: string;
}

export default defineWorkflow<
  ResearchInput,
  ResolverFactoryProposal & {
    artifact: Awaited<ReturnType<typeof artifact>>;
  }
>({
  id: 'nestjs-resolver-factory-research',
  version: 2,
  description:
    'Research current official NestJS CQRS and GraphQL in parallel, then produce a decision-ready ResolverFactory proposal.',
  maxConcurrency: 2,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['proposalAudience', 'constraints'],
    properties: {
      proposalAudience: { type: 'string', minLength: 1 },
      constraints: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 },
      },
    },
  },
  async run(input) {
    const research = await phase('Official NestJS package research', () =>
      parallel({
        cqrs: () =>
          agent<string, ResearchInput>({
            label: 'official-nestjs-cqrs-research',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt:
              'Research the current official @nestjs/cqrs package and NestJS CQRS architecture. Use current primary NestJS documentation and official package or repository sources, and include direct source links. Produce a source-grounded technical brief covering commands, queries, events, sagas, handlers, buses, modules, dependency injection, lifecycle, errors, testing, typing, and the implications for a reusable GraphQL ResolverFactory. Clearly separate verified facts, design implications, risks, and open questions. Do not implement code.',
            input,
          }),
        graphql: () =>
          agent<string, ResearchInput>({
            label: 'official-nestjs-graphql-research',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt:
              'Research the current official @nestjs/graphql package and NestJS GraphQL architecture. Use current primary NestJS documentation and official package or repository sources, and include direct source links. Produce a source-grounded technical brief covering code-first and schema-first resolvers, generic and mixin factories, decorators and metadata, dependency injection, request context, guards and interceptors, subscriptions, federation, testing, typing, lifecycle, errors, and the implications for a reusable CQRS-backed ResolverFactory. Clearly separate verified facts, design implications, risks, and open questions. Do not implement code.',
            input,
          }),
      }),
    );

    const decision = await phase('ResolverFactory consolidation', () =>
      agent<ResolverFactoryProposal, typeof research>({
        label: 'resolver-factory-consolidation',
        model: 'gpt-5.6-luna',
        reasoning: 'medium',
        prompt:
          'Consolidate both supplied research briefs into a rigorous, decision-ready proposal for a NestJS ResolverFactory that composes @nestjs/graphql with @nestjs/cqrs. Preserve and cite the strongest primary-source links from the briefs. Include goals and non-goals, package fit, architectural boundaries, API shape, generic typing strategy, decorator and metadata handling, dependency injection, command and query routing, request context and authorization, errors, pagination, subscriptions, federation, testing, migration, alternatives, risks, open decisions, and a phased implementation plan. Explicitly distinguish verified NestJS behavior from recommended design. Return the proposal as Markdown in the proposal field; do not return implementation code.',
        input: research,
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['proposal'],
          properties: {
            proposal: { type: 'string', minLength: 1 },
          },
        },
      }),
    );

    const saved = await artifact('resolver-factory-proposal.md', {
      value: decision.proposal,
      mediaType: 'text/markdown',
    });
    return { proposal: decision.proposal, artifact: saved };
  },
});
