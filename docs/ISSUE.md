Currently, coordinator incorrectly dispatches workers synchronously (for loop). We need to dispatch them in parallel (Promise.all).
However, this will likely break our synchronization code.
We need to evaluate how to make coordinator work properly under these conditions, and we need to test our implementation against the edge test.
