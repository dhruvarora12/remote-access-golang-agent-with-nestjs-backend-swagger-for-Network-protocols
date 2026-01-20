package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	ServerURL string `json:"serverUrl"`
	HostID    string `json:"hostId"`
}

func LoadConfig() (*Config, error) {
	// Config locations to try (in order)
	configPaths := []string{
		"/etc/remote-agent/config.json",
		"./config/config.json",  // ✅ Build script creates it here
		"./config.json",
		"config.json",
	}
	
	// Try each config path
	for _, configPath := range configPaths {
		data, err := os.ReadFile(configPath)
		if err == nil {
			// Found config file
			var config Config
			err = json.Unmarshal(data, &config)
			if err != nil {
				return nil, fmt.Errorf("failed to parse config: %w", err)
			}
			
			// ✅ HostID is optional - empty means fallback to MAC/hostname matching
			// ✅ Set default server URL if not provided
			if config.ServerURL == "" {
				config.ServerURL = getDefaultServerURL()
			}
			
			return &config, nil
		}
	}
	
	// ✅ No config file found - return default config instead of error
	return &Config{
		ServerURL: getDefaultServerURL(),
		HostID:    "", // Empty hostId - agent will use MAC/hostname matching
	}, nil
}

// getDefaultServerURL returns the default server URL
func getDefaultServerURL() string {
	// Try environment variable first
	if url := os.Getenv("AGENT_SERVER_URL"); url != "" {
		return url
	}
	
	// Default to localhost
	return "ws://localhost:3000"
}