What needs to be implemented:

Branch storage operations (currently TODO in operations/context.ts):

initializeBranchTable(tokenId, schema) - Create branch*output*{tokenId} tables
applyNodeOutput(tokenId, output, schema) - Write task results to branch tables
getBranchOutputs(tokenIds, schema) - Read all sibling branch tables
mergeBranches(siblings, mergeConfig, schema) - Apply merge strategy and write to context
dropBranchTables(tokenIds) - Cleanup after merge
ACTIVATE_FAN_IN handler (dispatch/apply.ts):

Query all sibling tokens from the sibling group
Call the branch storage operations to merge
Create a new merged token to proceed
Mark waiting siblings as completed
Emit proper trace events
Integration points:

Hook up applyNodeOutput when task results arrive
Ensure synchronization decision populates mergedTokenIds
Handle the CREATE_TOKEN decision for the merged token
Challenges:

Branch storage requires schema-driven SQL (using @wonder/schemas DDL/DML generators)
Merge strategies need careful implementation (append, merge_object, keyed_by_branch, last_wins)
Need to handle nested fan-outs (branch tables can nest)
Race conditions if multiple siblings try to activate simultaneously
