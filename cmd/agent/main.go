package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"remote-access/pkg/connection"
	"remote-access/pkg/executor"
	"remote-access/pkg/fileops"
	"remote-access/pkg/netscanner"
	"remote-access/pkg/sysinfo"
	"strings"
	"syscall"
	"time"
)

func main() {
	fmt.Println("=== Remote Access Agent Starting ===\n")

	// ✅ Load configuration
	config, err := LoadConfig()
	if err != nil {
		log.Fatal("Failed to load config:", err)
	}
	
	log.Printf("Host ID: %s", config.HostID)
	log.Printf("Server URL: %s", config.ServerURL)

	// Get system info once (will be reused for reconnections)
	sysInfo, err := sysinfo.GetSystemInfo()
	if err != nil {
		log.Fatal("Failed to get system info:", err)
	}
	
	// ✅ Convert sysInfo to map and add hostId
	jsonData, err := json.Marshal(sysInfo)
	if err != nil {
		log.Fatal("Failed to marshal system info:", err)
	}
	
	var sysInfoMap map[string]interface{}
	err = json.Unmarshal(jsonData, &sysInfoMap)
	if err != nil {
		log.Fatal("Failed to unmarshal system info:", err)
	}
	
	sysInfoMap["hostId"] = config.HostID

	// ✅ Create WebSocket client with config URL
	client := connection.NewClient(config.ServerURL)

	// ✅ Set up registration callback - called after EVERY connection
	client.SetOnConnect(func() {
		log.Println("Registering with server...")
		err := client.Emit("register", sysInfoMap)
		if err != nil {
			log.Printf("⚠️  Failed to register: %v", err)
		}
	})

	// Set up message handler for incoming commands
	client.SetMessageHandler(func(messageType string, data map[string]interface{}) {
		log.Printf("Received event: %s", messageType)

		switch messageType {
		case "execute_command":
			if cmd, ok := data["command"].(string); ok {
				// ✅ Extract commandId from the incoming command
				commandId, _ := data["commandId"].(string)
				
				log.Printf("Executing command: %s (ID: %s)", cmd, commandId)
				
				switch {
				case cmd == "NETWORK_SCAN":
					log.Println("Performing network scan...")
					
					client.Emit("scan_started", map[string]interface{}{
						"commandId": commandId,
						"message":   "Network scan started...",
					})
					
					scanDone := make(chan bool)
					var scanResult *netscanner.NetworkScanResult
					var scanErr error
					
					go func() {
						scanResult, scanErr = netscanner.ScanNetwork()
						scanDone <- true
					}()
					
					<-scanDone
					
					if scanErr != nil {
						log.Printf("Network scan error: %v", scanErr)
						client.Emit("command_result", map[string]interface{}{
							"commandId": commandId,
							"success":   false,
							"output":    "",
							"error":     scanErr.Error(),
						})
						return
					}
					
					jsonResult, err := json.Marshal(scanResult)
					if err != nil {
						log.Printf("JSON marshal error: %v", err)
						client.Emit("command_result", map[string]interface{}{
							"commandId": commandId,
							"success":   false,
							"output":    "",
							"error":     "Failed to marshal scan result",
						})
						return
					}
					
					log.Printf("Network scan complete. Found %d devices", scanResult.TotalDevices)
					client.Emit("command_result", map[string]interface{}{
						"commandId": commandId,
						"success":   true,
						"output":    string(jsonResult),
						"error":     "",
					})
					return

				case strings.HasPrefix(cmd, "FILE_LIST:"):
					path := strings.TrimPrefix(cmd, "FILE_LIST:")
					result := fileops.ListFiles(path)
					jsonResult, _ := json.Marshal(result)
					
					client.Emit("command_result", map[string]interface{}{
						"commandId": commandId,
						"success":   true,
						"output":    string(jsonResult),
						"error":     "",
					})
					return

				case strings.HasPrefix(cmd, "FILE_READ:"):
					path := strings.TrimPrefix(cmd, "FILE_READ:")
					result := fileops.ReadFile(path)
					jsonResult, _ := json.Marshal(result)
					
					client.Emit("command_result", map[string]interface{}{
						"commandId": commandId,
						"success":   true,
						"output":    string(jsonResult),
						"error":     "",
					})
					return

				case strings.HasPrefix(cmd, "FILE_WRITE:"):
					parts := strings.SplitN(strings.TrimPrefix(cmd, "FILE_WRITE:"), "|", 2)
					if len(parts) == 2 {
						result := fileops.WriteFile(parts[0], parts[1])
						jsonResult, _ := json.Marshal(result)
						
						client.Emit("command_result", map[string]interface{}{
							"commandId": commandId,
							"success":   true,
							"output":    string(jsonResult),
							"error":     "",
						})
					}
					return

				case strings.HasPrefix(cmd, "FILE_DELETE:"):
					path := strings.TrimPrefix(cmd, "FILE_DELETE:")
					result := fileops.DeleteFile(path)
					jsonResult, _ := json.Marshal(result)
					
					client.Emit("command_result", map[string]interface{}{
						"commandId": commandId,
						"success":   true,
						"output":    string(jsonResult),
						"error":     "",
					})
					return

				default:
					log.Printf("Executing shell command: %s", cmd)
					result := executor.ExecuteCommand(cmd)
					
					client.Emit("command_result", map[string]interface{}{
						"commandId": commandId,
						"success":   result.Error == "",
						"output":    result.Output,
						"error":     result.Error,
					})
					return
				}
			}

		case "registered":
			log.Printf("Registration confirmed: %v", data)
		}
	})

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	
	go func() {
		<-sigChan
		log.Println("\n🛑 Shutdown signal received. Disconnecting...")
		client.Disconnect()
		os.Exit(0)
	}()

	// Connect to server (registration happens automatically via callback)
	err = client.Connect()
	if err != nil {
		log.Printf("⚠️  Initial connection failed: %v", err)
		log.Println("🔄 Will retry automatically in background...")
		// Start reconnection process in background
		go func() {
			time.Sleep(2 * time.Second)
			client.Reconnect() // This will keep trying
		}()
	}

	// Keep connection alive and handle reconnections
	log.Println("✅ Agent running and waiting for commands...")
	client.KeepAlive()
}