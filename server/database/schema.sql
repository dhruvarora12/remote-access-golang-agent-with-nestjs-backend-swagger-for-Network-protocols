-- ============================================
-- IP-Based Agent ID Migration
-- ============================================
-- Run this AFTER clearing the agents table
-- ============================================

-- Step 1: Add socket_id column to store current WebSocket ID
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS socket_id VARCHAR(255);

-- Step 2: Add index on socket_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_socket_id 
ON agents(socket_id);

-- Step 3: Add comment to id column for clarity
COMMENT ON COLUMN agents.id IS 'Primary key: IP address of the agent';
COMMENT ON COLUMN agents.socket_id IS 'Current WebSocket socket ID (changes on reconnection)';

-- ============================================
-- Verification Queries
-- ============================================

-- Check table structure
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'agents'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'agents';

-- ============================================
-- After running migration, clear existing data:
-- ============================================

TRUNCATE TABLE agents CASCADE;

-- ============================================
-- Test the new structure
-- ============================================

-- This should work after agent registers:
-- SELECT * FROM agents WHERE id = '10.178.57.111';

-- Expected result:
-- id          | socket_id              | ip_address     | hostname
-- ------------+------------------------+----------------+-------------------
-- 10.178.57.111 | ABC123SocketID       | 10.178.57.111  | LENSs-MacBook-Air

-- On reconnection, socket_id changes but id stays same:
-- 10.178.57.111 | XYZ789NewSocketID    | 10.178.57.111  | LENSs-MacBook-Air

-- ============================================
-- COMMAND HISTORY TABLE
-- ============================================
-- Tracks all commands sent to agents
-- Foreign Key: agent_id references agents(id) = IP address
-- ============================================

-- Drop existing table if recreating
DROP TABLE IF EXISTS command_history CASCADE;

-- Create command history table
CREATE TABLE command_history (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agent identifier (IP address)
    agent_id VARCHAR(45) NOT NULL,  -- References agents.id
    
    -- Command details
    command TEXT NOT NULL,  -- Command to execute
    args TEXT,  -- Command arguments (space-separated)
    
    -- Execution results
    raw_output TEXT,  -- Raw command output
    parsed_output JSONB,  -- Parsed/structured output
    error TEXT,  -- Error message if failed
    exit_code INTEGER,  -- Command exit code (0 = success)
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending',  -- pending, completed, failed
    
    -- Timestamps
    executed_at TIMESTAMP DEFAULT NOW(),  -- When command was sent
    completed_at TIMESTAMP,  -- When result received
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup by agent
CREATE INDEX idx_command_history_agent_id ON command_history(agent_id);

-- Fast lookup by status
CREATE INDEX idx_command_history_status ON command_history(status);

-- Fast lookup by execution time
CREATE INDEX idx_command_history_executed_at ON command_history(executed_at DESC);

-- Combined index for common queries
CREATE INDEX idx_command_history_agent_executed 
ON command_history(agent_id, executed_at DESC);

-- ============================================
-- FOREIGN KEY
-- ============================================

-- Link to agents table
ALTER TABLE command_history
ADD CONSTRAINT fk_command_history_agent
FOREIGN KEY (agent_id) 
REFERENCES agents(id)
ON DELETE CASCADE;  -- Delete commands when agent deleted

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE command_history IS 'History of commands sent to agents';
COMMENT ON COLUMN command_history.agent_id IS 'IP address of the agent (foreign key to agents.id)';
COMMENT ON COLUMN command_history.command IS 'Command that was executed';
COMMENT ON COLUMN command_history.raw_output IS 'Raw output from command execution';
COMMENT ON COLUMN command_history.parsed_output IS 'Structured/parsed command output';
COMMENT ON COLUMN command_history.status IS 'pending, completed, or failed';

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Get recent commands for an agent
-- SELECT command, status, executed_at, completed_at 
-- FROM command_history 
-- WHERE agent_id = '10.178.57.111' 
-- ORDER BY executed_at DESC 
-- LIMIT 50;

-- Get pending commands
-- SELECT id, agent_id, command, executed_at 
-- FROM command_history 
-- WHERE status = 'pending' 
-- ORDER BY executed_at;

-- Get failed commands
-- SELECT agent_id, command, error, executed_at 
-- FROM command_history 
-- WHERE status = 'failed' 
-- ORDER BY executed_at DESC;

-- Command execution statistics per agent
-- SELECT 
--     agent_id,
--     COUNT(*) as total_commands,
--     SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
--     SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
--     AVG(EXTRACT(EPOCH FROM (completed_at - executed_at))) as avg_execution_time_seconds
-- FROM command_history
-- WHERE completed_at IS NOT NULL
-- GROUP BY agent_id;

-- ============================================
-- CLEANUP: Remove old history (optional cron job)
-- ============================================

-- Delete commands older than 90 days
-- DELETE FROM command_history 
-- WHERE executed_at < NOW() - INTERVAL '90 days';