-- Migration number: 0004 	 2025-11-26T02:35:00.000Z
-- Fix output_mapping in Hello World node to map 'response' key from LLM

UPDATE nodes
SET output_mapping = '{"greeting":"$.response"}'
WHERE id = '01JDXSEED0000NODE0000001';
