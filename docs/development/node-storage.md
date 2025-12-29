Every execution produces output to token-scoped storage
Every token gets output storage - not just fan-out tokens

Linear: single branch*output*{tokenId} table
Fan-out: multiple sibling branch*output*\* tables
Node output_mapping writes to token's output storage

Task result → mapped fields → token's output table
Schema comes from Task.output_schema (already exists)
Workflow completion extracts final output

Applies workflow.output_mapping to last token's output (or merged outputs)
Validates against output_schema
Writes to final context_output table
getSnapshot().output for decision logic

Reads from token output storage (not the final output table)
Enables routing based on node results
Why This Is Sound
Consistent model - fan-out and linear use same storage mechanism
Schema-driven - Task.output_schema validates token outputs
Clean separation - intermediate results ≠ final output
Existing infrastructure - leverages branch storage already built
No JSON blobs - still normalized SQL tables
Implementation
The change is conceptual, not massive:

applyNodeOutput(tokenId, output) always writes to branch*output*{tokenId}
Remove the current outputTable.replace() call that tries to write to schema-mismatched table
getSnapshot() reads node outputs from token table(s)
Workflow finalization applies output_mapping and writes validated output

---

Every token gets a branch table (branch*output*{tokenId})
Schema comes from Task.output_schema
Branch tables are created when token is dispatched
Node output writes to token's branch table
At fan-in, merge strategies combine sibling outputs into context.state
Branch tables are dropped after merge
For linear flows, there's no explicit fan-in, but the same model applies:

Each token writes to its branch table
getSnapshot().output needs to read from completed tokens' branch tables
The key is mapping node_ref → completed token → branch table
