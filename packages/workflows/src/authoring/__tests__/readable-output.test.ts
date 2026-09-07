import { describe, expect, it } from 'vitest';
import { agent, defineWorkflow, executeWorkflow } from '../../index.js';

describe('[L1:INTEGRATION] visible source metadata and validated output',()=>{
  it('R2-TITLE preserves optional human title while keeping id/version identity',()=>{
    const options={id:'readable-demo',title:'Readable Demo',description:'Supporting description',run:()=>null};
    expect(defineWorkflow(options)).toMatchObject({id:'readable-demo',title:'Readable Demo',version:1});
    expect(defineWorkflow({id:'legacy-demo',run:()=>null}).id).toBe('legacy-demo');
  });
  it('R2-VALIDATED-RESULT publishes only after existing outputSchema validation and retains node provenance',async()=>{
    const outputs:unknown[]=[];
    const workflow=defineWorkflow({id:'visible-result',run:()=>agent({label:'Builder',model:'gpt-5.6-luna',reasoning:'low',prompt:'Synthetic',outputSchema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}})});
    const options={runId:'visible-result-run',executeAgent:async()=>({threadId:'thread-a',finalResponse:'{"status":"ready"}',usage:null}),writeArtifact:async()=>({name:'unused',path:'unused',digest:`sha256:${'a'.repeat(64)}` as const,mediaType:'application/json'}),onEvent:async()=>undefined,onAgentOutput:async(output:unknown)=>{outputs.push(output);}};
    await executeWorkflow(workflow,{},options);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({node:{id:expect.any(String),outputSchemaDigest:expect.stringMatching(/^sha256:/)},output:{status:'ready'}});
    outputs.length=0;
    await expect(executeWorkflow(workflow,{}, {...options,executeAgent:async()=>({threadId:'thread-a',finalResponse:'{"bad":true}',usage:null})})).rejects.toThrow();
    expect(outputs).toHaveLength(0);
  });
});
