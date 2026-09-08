import { describe, expect, it } from 'vitest';
import * as visibility from '../index.js';

const at='2026-09-04T16:00:00.000Z';
const event=(overrides:Record<string,unknown>={})=>({eventId:'event-a',source:'app-server',kind:'item.message.delta',occurredAt:at,workflowId:'workflow-a',agentId:'agent-a',itemId:'item-a',item:{threadId:'thread-a',turnId:'turn-a',itemId:'item-a',itemType:'agentMessage',operation:'append',messagePhase:'commentary',body:'Hello '},...overrides});
type Item=Record<string,unknown>;
function reducer(){const fn=(visibility as Record<string,unknown>).reduceVisibleItem;expect(fn).toBeTypeOf('function');return fn as (previous:Item|undefined, event:ReturnType<typeof visibility.normalizeVisibilityObservation>,revision:string)=>Item;}

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] readable visibility items',()=>{
  it('R2-ITEM-METADATA preserves scoped owner/lifecycle/phase and excludes reasoning and secrets',()=>{
    const normalized=visibility.normalizeVisibilityObservation(event()) as unknown as {item?:Item};
    expect(normalized.item).toMatchObject({threadId:'thread-a',turnId:'turn-a',itemId:'item-a',itemType:'agentMessage',operation:'append',messagePhase:'commentary'});
    const unsafe=visibility.normalizeVisibilityObservation(event({item:{threadId:'thread-a',turnId:'turn-a',itemId:'item-a',itemType:'agentMessage',operation:'replace',messagePhase:'final_answer',body:'token=private-value /Users/private/file'}}));
    expect(JSON.stringify(unsafe)).not.toContain('private-value');
    expect(JSON.stringify(unsafe)).not.toContain('/Users/private');
    expect(visibility.normalizeVisibilityObservation(event({kind:'reasoning.delta'}))).toBeNull();
  });
  it('R2-ITEM-REPLAY appends once, replaces completed content and rejects stale deltas without merging turns',()=>{
    const reduce=reducer();
    const first=reduce(undefined,visibility.normalizeVisibilityObservation(event()),'1');
    const second=reduce(first,visibility.normalizeVisibilityObservation(event({eventId:'event-b',item:{threadId:'thread-a',turnId:'turn-a',itemId:'item-a',itemType:'agentMessage',operation:'append',body:'world.'}})),'2');
    expect(second.body).toBe('Hello world.');
    expect(reduce(second,visibility.normalizeVisibilityObservation(event()),'1')).toEqual(second);
    const final=reduce(second,visibility.normalizeVisibilityObservation(event({eventId:'event-c',kind:'item.completed',item:{threadId:'thread-a',turnId:'turn-a',itemId:'item-a',itemType:'agentMessage',operation:'replace',body:'Final message.'}})),'3');
    expect(final.body).toBe('Final message.');
    expect(final.state).toBe('completed');
    expect(reduce(final,visibility.normalizeVisibilityObservation(event()),'4')).toEqual(final);
    const other=reduce(undefined,visibility.normalizeVisibilityObservation(event({item:{threadId:'thread-a',turnId:'turn-b',itemId:'item-a',itemType:'agentMessage',operation:'append',body:'Hello '}})),'5');
    expect(other.id).not.toBe(first.id);
  });
  it('R2-ITEM-LIMITS applies explicit evaluation byte limits without broken Unicode or false structured completeness',()=>{
    const reduce=reducer();
    const body='漢'.repeat(30_000);
    const item=reduce(undefined,visibility.normalizeVisibilityObservation(event({kind:'item.completed',item:{threadId:'thread-a',turnId:'turn-a',itemId:'item-a',itemType:'agentMessage',operation:'replace',body}})),'1');
    expect(Buffer.byteLength(String(item.body))).toBeLessThanOrEqual(65_536);
    expect(String(item.body)).not.toContain('\uFFFD');
    expect(item.truncated).toBe(true);
    expect(item.evaluation).toBe(true);
    expect(item.originalBytes).toBe(90_000);
  });
});
