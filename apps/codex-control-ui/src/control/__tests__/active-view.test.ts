import {describe,expect,it,vi} from 'vitest';
import {createControlSession} from '../session';
import type {VisibilityResult} from '../types';

describe('[L1:INTEGRATION] current workflow view',()=>{
  it('R2-CANCELLED-VIEW removes authoritative cancellation, clears its selection and preserves other work',async()=>{
    const received:VisibilityResult[]=[];const waits:Record<string,unknown>[]=[];
    const workflow=(id:string,status:'running'|'cancelled')=>({id,label:id,status,stateText:status,steps:[{id:'step',label:'Step',agents:[{id:'agent-'+id,label:'Agent',status,stateText:status}]}]});
    let release:((r:VisibilityResult)=>void)|undefined;
    const session=createControlSession({initialAgentId:'agent-a',client:{async callTool(name,args,options){if(name==='get_control_snapshot')return {cursor:'1',changed:true,workflows:[workflow('a','running'),workflow('b','running')],details:{agentId:'agent-a',events:[],truncated:false}};waits.push(args);return new Promise<VisibilityResult>((resolve,reject)=>{release=resolve;options?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});}},onResult:r=>received.push(r),onPhase:()=>undefined});
    try{await session.start();release?.({cursor:'2',changed:true,workflows:[workflow('a','cancelled'),workflow('b','running')],details:{agentId:'agent-a',events:[],truncated:false}});await vi.waitFor(()=>expect(received.at(-1)?.workflows?.map(w=>w.id)).toEqual(['b']));expect(received.at(-1)?.details).toBeUndefined();await vi.waitFor(()=>expect(waits.at(-1)?.selectedAgentId).toBeUndefined());release?.({cursor:'1',changed:true,workflows:[workflow('a','running'),workflow('b','running')]});await new Promise(resolve=>setTimeout(resolve,0));expect(received.at(-1)?.workflows?.map(w=>w.id)).toEqual(['b']);}
    finally{session.stop();}
  });
});
