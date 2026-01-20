-- ============================================
-- COMPLETE DATABASE MIGRATION
-- IP-Based Agent System
-- ============================================
-- Run this script to set up clean tables
-- Version: 1.2.0
-- Date: 2025-10-10
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Drop existing tables (if any)
-- ============================================

DROP TABLE IF EXISTS command_history CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

-- ============================================
-- STEP 2: Create agents table
-- ============================================

CREATE TABLE agents (
    -- Primary identifier (UUID)
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Current WebSocket connection
    socket_id VARCHAR(255),
    
    -- Network information
    ip_address VARCHAR(45) NOT NULL UNIQUE,  -- Unique constraint
    mac_address VARCHAR(17),
    
    -- System information
    hostname VARCHAR(255),
    os VARCHAR(50),
    arch VARCHAR(50),
    platform VARCHAR(50),
    
    -- Hardware specs (JSON)
    cpu_info JSONB,
    memory_info JSONB,
    disk_info JSONB,
    
    -- Full system info
    system_info JSONB,
    
    -- Connection tracking
    connected_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    is_online BOOLEAN DEFAULT true,
    
    -- Relationships
    business_id UUID,
    site_id UUID,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- STEP 3: Create command_history table
-- ============================================

CREATE TABLE command_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agent reference (IP address)
    agent_id VARCHAR(45) NOT NULL,
    
    -- Command details
    command TEXT NOT NULL,
    args TEXT,
    
    -- Results
    raw_output TEXT,
    parsed_output JSONB,
    error TEXT,
    exit_code INTEGER,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Timestamps
    executed_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- STEP 4: Add indexes to agents
-- ============================================

CREATE INDEX idx_agents_socket_id ON agents(socket_id);
CREATE INDEX idx_agents_is_online ON agents(is_online);
CREATE INDEX idx_agents_business_id ON agents(business_id);
CREATE INDEX idx_agents_site_id ON agents(site_id);
CREATE INDEX idx_agents_last_seen ON agents(last_seen);
CREATE INDEX idx_agents_online_business ON agents(is_online, business_id);

-- ============================================
-- STEP 5: Add indexes to command_history
-- ============================================

CREATE INDEX idx_command_history_agent_id ON command_history(agent_id);
CREATE INDEX idx_command_history_status ON command_history(status);
CREATE INDEX idx_command_history_executed_at ON command_history(executed_at DESC);
CREATE INDEX idx_command_history_agent_executed ON command_history(agent_id, executed_at DESC);

-- ============================================
-- STEP 6: Add foreign key constraint
-- ============================================

ALTER TABLE command_history
ADD CONSTRAINT fk_command_history_agent
FOREIGN KEY (agent_id) 
REFERENCES agents(id)
ON DELETE CASCADE;

-- ============================================
-- STEP 7: Add check constraint
-- ============================================

ALTER TABLE agents 
ADD CONSTRAINT chk_ip_matches_id 
CHECK (id = ip_address);

-- ============================================
-- STEP 8: Add comments
-- ============================================

COMMENT ON TABLE agents IS 'Remote access agents identified by IP address';
COMMENT ON COLUMN agents.id IS 'Primary key: IP address (e.g., 10.178.57.111)';
COMMENT ON COLUMN agents.socket_id IS 'Current WebSocket socket ID (changes on reconnection)';
COMMENT ON COLUMN agents.ip_address IS 'IP address (duplicate of id)';

COMMENT ON TABLE command_history IS 'History of commands sent to agents';
COMMENT ON COLUMN command_history.agent_id IS 'IP address of the agent (FK to agents.id)';

-- ============================================
-- STEP 9: Create trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_agents_updated_at();

-- ============================================
-- COMMIT
-- ============================================

COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================

-- Check tables exist
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name IN ('agents', 'command_history')
ORDER BY table_name;

-- Check indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('agents', 'command_history')
ORDER BY tablename, indexname;

-- Check foreign keys
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name IN ('agents', 'command_history');

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 
    '✅ Migration completed successfully!' as status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'agents') as agents_table_exists,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'command_history') as command_history_table_exists,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename IN ('agents', 'command_history')) as total_indexes_created;