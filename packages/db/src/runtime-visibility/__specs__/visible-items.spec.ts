import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {describe,expect,it} from 'vitest';
import {normalizeVisibilityObservation} from '@codex/process';
import {PostgresRuntimeVisibilityRepository} from '../postgres-runtime-visibility.repository.js';
import {createRuntimeVisibilityDatabaseFixture} from '../testing/runtime-visibility-database-fixture.js';

describe('[L2:INTEGRATION] durable readable items',()=>{
  it('R2-PERSISTENCE replays one complete logical item and isolates selection with explicit evaluation retention',async()=>{
    const fixture=await createRuntimeVisibilityDatabaseFixture();
    const owner=new Client({connectionString:fixture.ownerUrl});await owner.connect();
    try{
      const sql=await readFile('migrations/process/007_visibility_items.sql','utf8').catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
      if(sql)await owner.query(sql);
      const repository=new PostgresRuntimeVisibilityRepository(fixture.daemonUrl);
      const observation=(id:string,agentId:string,body:string,operation='append')=>normalizeVisibilityObservation({eventId:id,source:'app-server',kind:operation==='replace'?'item.completed':'item.message.delta',occurredAt:'2026-09-04T16:00:00.000Z',workflowId:'workflow-a',agentId,itemId:'same-item',item:{threadId:'thread-'+agentId,turnId:'turn-a',itemId:'same-item',itemType:'agentMessage',operation,body}});
      for(let i=0;i<105;i++){const event=observation('delta-'+i,'agent-a','part ');if(!event)throw Error('EVENT_MISSING');await repository.ingest(event);}
      const final=observation('final-a','agent-a','Complete final text.','replace');if(!final)throw Error('EVENT_MISSING');await repository.ingest(final);await repository.ingest(final);
      const other=observation('final-b','agent-b','Other private agent.','replace');if(!other)throw Error('EVENT_MISSING');await repository.ingest(other);
      type Snapshot={details?:{agentId:string;items?:Array<{id:string;body:string;state:string}>};evaluationLimits?:{itemBytes:number;logicalItems:number;aggregateBytes:number;permanent:boolean}};
      const snapshot=await repository.snapshot({selectedAgentId:'agent-a'}) as unknown as Snapshot;
      expect(snapshot.details?.items).toHaveLength(1);
      expect(snapshot.details?.items?.[0]).toMatchObject({body:'Complete final text.',state:'completed'});
      expect(JSON.stringify(snapshot)).not.toContain('Other private agent.');
      expect(snapshot.evaluationLimits).toEqual({itemBytes:65_536,logicalItems:100,aggregateBytes:2_097_152,permanent:false});
      expect(await new PostgresRuntimeVisibilityRepository(fixture.daemonUrl).snapshot({selectedAgentId:'agent-a'})).toEqual(snapshot);
      expect((await repository.snapshot()).details).toBeUndefined();
      const stored=await owner.query('SELECT count(*)::int AS count FROM process.runtime_visibility_event');
      expect(stored.rows[0].count).toBe(107);
      for(let i=0;i<40;i++){
        const bounded=normalizeVisibilityObservation({eventId:'large-'+i,source:'app-server',kind:'item.completed',occurredAt:'2026-09-04T16:00:00.000Z',agentId:'agent-a',itemId:'large-'+i,item:{threadId:'thread-agent-a',turnId:'turn-a',itemId:'large-'+i,itemType:'agentMessage',operation:'replace',body:'x'.repeat(65_000)}});
        if(!bounded)throw Error('EVENT_MISSING');await repository.ingest(bounded);
      }
      const capped=await repository.snapshot({selectedAgentId:'agent-a'}) as unknown as {details:{items:Array<{body:string}>,truncated:boolean}};
      expect(capped.details.items.length).toBeGreaterThan(0);
      expect(capped.details.items.length).toBeLessThanOrEqual(100);
      expect(capped.details.items.reduce((sum,item)=>sum+Buffer.byteLength(item.body),0)).toBeLessThanOrEqual(2_097_152);
      expect(capped.details.truncated).toBe(true);
      expect((await owner.query('SELECT count(*)::int AS count FROM process.runtime_visibility_event')).rows[0].count).toBe(147);
    }finally{await owner.end();await fixture.close();}
  },30_000);
});
