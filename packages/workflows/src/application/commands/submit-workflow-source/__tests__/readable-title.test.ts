import {describe,expect,it} from 'vitest';
import {createWorkflowSourceSubmission} from '../submit-workflow-source.handler.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] admitted readable title',()=>{
  it('R2-TITLE-ADMISSION carries compiler-derived display title without additional agent-facing arguments',async()=>{
    const submitted:unknown[]=[];
    const submit=createWorkflowSourceSubmission({resolveContext:async()=>({sourceRoot:'/fixture',artifactDirectory:'/fixture/out',hostId:'local',workspace:{repositoryId:'repo',assignmentId:'task',baseRevision:'a'.repeat(40)},runtimeProfile:{model:'gpt-5.6-luna',reasoningEffort:'low',sandbox:'readOnly',approvalPolicy:'never'}}),compileSource:async()=>({workflowRef:'source.'+'b'.repeat(64),sourceDigest:`sha256:${'b'.repeat(64)}` as const,display:{id:'human-demo',title:'Human Demo'}}),submit:async command=>{submitted.push(command);return {runId:'unused'};}});
    await submit({source:'demo.workflow.ts',idempotencyKey:'human-demo'},{actorAgentId:'operator',scopes:['control:workflow']});
    expect(submitted[0]).toMatchObject({display:{id:'human-demo',title:'Human Demo'},sourceDigest:`sha256:${'b'.repeat(64)}`});
  });
});
