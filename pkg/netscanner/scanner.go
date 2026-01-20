package netscanner

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type Device struct {
	IP         string   `json:"ip"`
	MAC        string   `json:"mac"`
	Hostname   string   `json:"hostname"`
	Vendor     string   `json:"vendor"`
	DeviceType string   `json:"deviceType"`
	Status     string   `json:"status"`
	LastSeen   string   `json:"lastSeen"`
	OpenPorts  []int    `json:"openPorts,omitempty"`
	Services   []string `json:"services,omitempty"`
}

type NetworkScanResult struct {
	LocalIP      string   `json:"localIP"`
	Network      string   `json:"network"`
	Gateway      string   `json:"gateway"`
	Devices      []Device `json:"devices"`
	TotalDevices int      `json:"totalDevices"`
	ScanTime     string   `json:"scanTime"`
}

var (
	ouiDatabase     map[string]string
	ouiDatabaseLock sync.RWMutex
	ouiLoaded       bool
)

// LoadOUIDatabase downloads and caches the IEEE OUI database
func LoadOUIDatabase() error {
	ouiDatabaseLock.Lock()
	defer ouiDatabaseLock.Unlock()

	if ouiLoaded {
		return nil
	}

	ouiDatabase = make(map[string]string)
	cacheFile := filepath.Join(os.TempDir(), "oui_cache.txt")

	// Check if cache exists and is less than 30 days old
	if info, err := os.Stat(cacheFile); err == nil {
		age := time.Since(info.ModTime())
		if age < 30*24*time.Hour {
			fmt.Println("Loading OUI database from cache...")
			if err := loadOUIFromFile(cacheFile); err == nil {
				fmt.Printf("Loaded %d vendors from cache\n", len(ouiDatabase))
				ouiLoaded = true
				return nil
			}
		}
	}

	// Download fresh database
	fmt.Println("Downloading IEEE OUI database... (this may take a moment)")
	resp, err := http.Get("https://standards-oui.ieee.org/oui/oui.txt")
	if err != nil {
		fmt.Println("Failed to download OUI database, using minimal fallback")
		loadMinimalOUI()
		ouiLoaded = true
		return nil
	}
	defer resp.Body.Close()

	// Save to cache file
	cacheFileHandle, err := os.Create(cacheFile)
	if err != nil {
		return parseOUIData(resp.Body)
	}
	defer cacheFileHandle.Close()

	// Copy data to cache and parse simultaneously
	reader := io.TeeReader(resp.Body, cacheFileHandle)
	err = parseOUIData(reader)
	
	fmt.Printf("Downloaded and cached %d vendors\n", len(ouiDatabase))
	ouiLoaded = true
	return err
}

func loadOUIFromFile(filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	return parseOUIData(file)
}

func parseOUIData(reader io.Reader) error {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "(hex)") {
			parts := strings.Split(line, "(hex)")
			if len(parts) >= 2 {
				macPrefix := strings.TrimSpace(parts[0])
				macPrefix = strings.ReplaceAll(macPrefix, "-", ":")
				vendor := strings.TrimSpace(parts[1])
				if macPrefix != "" && vendor != "" {
					ouiDatabase[strings.ToUpper(macPrefix)] = vendor
				}
			}
		}
	}
	return scanner.Err()
}

func loadMinimalOUI() {
	ouiDatabase = map[string]string{
		"00:50:56": "VMware",
		"00:0C:29": "VMware",
		"00:1C:42": "Parallels",
		"08:00:27": "Oracle VirtualBox",
		"52:54:00": "QEMU/KVM",
		"00:15:5D": "Microsoft Hyper-V",
		"00:1C:B3": "Apple",
		"00:1F:5B": "Apple",
		"AC:DE:48": "Apple",
		"F0:18:98": "Apple",
		"00:1D:C0": "D-Link",
		"00:1C:F0": "TP-Link",
		"A0:F3:C1": "TP-Link",
		"00:23:CD": "Cisco Systems",
		"00:40:96": "Cisco Systems",
		"00:18:0A": "Netgear",
		"B8:27:EB": "Raspberry Pi Foundation",
		"DC:A6:32": "Raspberry Pi Foundation",
		"00:12:FB": "Samsung",
		"28:85:2C": "Samsung",
		"00:12:12": "Hikvision",
		"44:19:B6": "Hikvision",
		"00:1B:21": "Intel Corporate",
		"00:13:21": "Hewlett Packard",
		"00:14:22": "Dell",
		"01:00:5E": "Multicast",
		"FF:FF:FF": "Broadcast",
	}
}

// GetVendorFromMAC looks up vendor from MAC address
func GetVendorFromMAC(mac string) string {
	if mac == "" || mac == "(incomplete)" {
		return "Unknown"
	}

	// Normalize MAC address
	mac = strings.ToUpper(strings.ReplaceAll(mac, "-", ":"))
	
	// Ensure proper format (pad with zeros if needed)
	parts := strings.Split(mac, ":")
	for i, part := range parts {
		if len(part) == 1 {
			parts[i] = "0" + part
		}
	}
	mac = strings.Join(parts, ":")

	ouiDatabaseLock.RLock()
	defer ouiDatabaseLock.RUnlock()

	// Check first 8 characters (3 octets)
	if len(mac) >= 8 {
		prefix := mac[:8]
		if vendor, found := ouiDatabase[prefix]; found {
			return vendor
		}
	}

	// Try online API as fallback (with timeout)
	vendor := lookupVendorOnline(mac)
	if vendor != "" {
		return vendor
	}

	return "Unknown"
}

func lookupVendorOnline(mac string) string {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("https://api.macvendors.com/" + mac)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		body, err := io.ReadAll(resp.Body)
		if err == nil {
			vendor := strings.TrimSpace(string(body))
			if !strings.HasPrefix(vendor, "{\"errors\"") {
				// Cache it
				ouiDatabaseLock.Lock()
				if len(mac) >= 8 {
					ouiDatabase[mac[:8]] = vendor
				}
				ouiDatabaseLock.Unlock()
				return vendor
			}
		}
	}
	return ""
}

// GetEnhancedHostname uses multiple methods to resolve hostname
func GetEnhancedHostname(ip string) string {
	// Use a channel with timeout to prevent hanging
	resultChan := make(chan string, 1)
	
	go func() {
		// Method 1: Standard DNS reverse lookup (fastest, most reliable)
		if names, err := net.LookupAddr(ip); err == nil && len(names) > 0 {
			hostname := strings.TrimSuffix(names[0], ".")
			if hostname != "" && hostname != ip {
				resultChan <- hostname
				return
			}
		}

		// Method 2: NetBIOS (Windows/Samba networks) - Skip SNMP and HTTP as they're slow
		if runtime.GOOS == "windows" {
			if hostname := getNetBIOSHostname(ip); hostname != "" {
				resultChan <- hostname
				return
			}
		}
		
		resultChan <- "Unknown"
	}()
	
	// Wait max 2 seconds for hostname resolution
	select {
	case hostname := <-resultChan:
		return hostname
	case <-time.After(2 * time.Second):
		return "Unknown"
	}
}

func getSNMPHostname(ip string) string {
	if runtime.GOOS == "windows" {
		return "" // Skip SNMP on Windows for now
	}

	for _, community := range []string{"public", "private"} {
		cmd := exec.Command("snmpget", "-v2c", "-c", community, "-t", "1", ip, "SNMPv2-MIB::sysName.0")
		output, err := cmd.Output()
		if err == nil && strings.Contains(string(output), "=") {
			parts := strings.Split(string(output), "=")
			if len(parts) > 1 {
				hostname := strings.TrimSpace(strings.Trim(parts[1], "\""))
				if hostname != "" && hostname != ip {
					return hostname
				}
			}
		}
	}
	return ""
}

func getNetBIOSHostname(ip string) string {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("nbtstat", "-A", ip)
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, "<00>") && !strings.Contains(line, "GROUP") {
					fields := strings.Fields(line)
					if len(fields) > 0 {
						return strings.TrimSpace(fields[0])
					}
				}
			}
		}
	} else {
		cmd := exec.Command("nmblookup", "-A", ip)
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, "<00>") && !strings.Contains(line, "GROUP") {
					fields := strings.Fields(line)
					if len(fields) > 0 {
						return strings.TrimSpace(fields[0])
					}
				}
			}
		}
	}
	return ""
}

func getHTTPHostname(ip string) string {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Head("http://" + ip)
	if err == nil {
		defer resp.Body.Close()
		if server := resp.Header.Get("Server"); server != "" {
			if len(server) > 20 {
				server = server[:20]
			}
			return "WebServer (" + server + ")"
		}
	}
	return ""
}

// ScanPorts scans common ports on a device with timeout
func ScanPorts(ip string) []int {
	// Reduced port list for faster scanning
	commonPorts := []int{22, 80, 443, 445, 3389, 8080}
	var openPorts []int
	var wg sync.WaitGroup
	var mu sync.Mutex
	
	// Use a channel to signal completion
	done := make(chan bool, 1)
	
	go func() {
		for _, port := range commonPorts {
			wg.Add(1)
			go func(p int) {
				defer wg.Done()
				address := fmt.Sprintf("%s:%d", ip, p)
				conn, err := net.DialTimeout("tcp", address, 200*time.Millisecond)
				if err == nil {
					conn.Close()
					mu.Lock()
					openPorts = append(openPorts, p)
					mu.Unlock()
				}
			}(port)
		}
		wg.Wait()
		done <- true
	}()
	
	// Wait max 3 seconds for port scan
	select {
	case <-done:
		return openPorts
	case <-time.After(3 * time.Second):
		fmt.Printf("⚠️  Port scan timeout for %s\n", ip)
		return openPorts
	}
}

// IdentifyDeviceType identifies device type based on multiple factors
func IdentifyDeviceType(ip, mac, vendor, hostname string, openPorts []int) (string, []string) {
	deviceType := "Unknown Device"
	var services []string

	vendorLower := strings.ToLower(vendor)
	hostnameLower := strings.ToLower(hostname)

	// Vendor-based identification
	if strings.Contains(vendorLower, "apple") {
		if strings.Contains(vendorLower, "iphone") {
			deviceType = "iPhone"
		} else if strings.Contains(vendorLower, "ipad") {
			deviceType = "iPad"
		} else {
			deviceType = "Apple Device"
		}
	} else if strings.Contains(vendorLower, "samsung") {
		deviceType = "Samsung Phone/Tablet"
	} else if strings.Contains(vendorLower, "raspberry") {
		deviceType = "Raspberry Pi"
	} else if strings.Contains(vendorLower, "cisco") || strings.Contains(vendorLower, "netgear") || 
	           strings.Contains(vendorLower, "tp-link") || strings.Contains(vendorLower, "d-link") ||
	           strings.Contains(vendorLower, "fortinet") || strings.Contains(vendorLower, "fortigate") ||
	           strings.Contains(vendorLower, "ubiquiti") || strings.Contains(vendorLower, "mikrotik") {
		deviceType = "Router/Firewall"
	} else if strings.Contains(vendorLower, "hikvision") || strings.Contains(vendorLower, "axis") {
		deviceType = "IP Camera"
	} else if strings.Contains(vendorLower, "printer") || strings.Contains(vendorLower, "epson") || 
	           strings.Contains(vendorLower, "canon") {
		deviceType = "Printer"
	} else if strings.Contains(vendorLower, "vmware") || strings.Contains(vendorLower, "virtualbox") || 
	           strings.Contains(vendorLower, "qemu") {
		deviceType = "Virtual Machine"
	} else if strings.Contains(vendorLower, "microsoft") || strings.Contains(vendorLower, "intel") || 
	           strings.Contains(vendorLower, "dell") {
		deviceType = "Computer"
	}

	// Port-based identification (overrides if more specific)
	for _, port := range openPorts {
		switch port {
		case 554:
			deviceType = "IP Camera"
			services = append(services, "RTSP Streaming")
		case 9100:
			deviceType = "Network Printer"
			services = append(services, "HP JetDirect")
		case 3389:
			deviceType = "Windows PC"
			services = append(services, "RDP")
		case 445, 139:
			if deviceType == "Unknown Device" {
				deviceType = "Windows/Samba Device"
			}
			services = append(services, "SMB/File Sharing")
		case 22:
			if deviceType == "Unknown Device" {
				deviceType = "Linux/Unix Device"
			}
			services = append(services, "SSH")
		case 548:
			deviceType = "Mac/Apple Device"
			services = append(services, "AFP Sharing")
		case 5900:
			services = append(services, "VNC Server")
		case 80, 443:
			services = append(services, "Web Interface")
		case 161:
			services = append(services, "SNMP")
		case 8080:
			services = append(services, "HTTP Alt")
		}
	}

	// Hostname-based hints
	if strings.Contains(hostnameLower, "raspberry") || strings.Contains(hostnameLower, "pi") {
		deviceType = "Raspberry Pi"
	} else if strings.Contains(hostnameLower, "android") {
		deviceType = "Android Device"
	} else if strings.Contains(hostnameLower, "iphone") || strings.Contains(hostnameLower, "ipad") {
		deviceType = strings.Title(hostnameLower)
	} else if strings.Contains(hostnameLower, "camera") || strings.Contains(hostnameLower, "cam") {
		deviceType = "IP Camera"
	} else if strings.Contains(hostnameLower, "printer") || strings.Contains(hostnameLower, "print") {
		deviceType = "Printer"
	} else if strings.Contains(hostnameLower, "router") || strings.Contains(hostnameLower, "gateway") ||
	           strings.Contains(hostnameLower, "firewall") || strings.Contains(hostnameLower, "fortigate") {
		deviceType = "Router/Firewall"
	}

	if len(openPorts) > 0 && len(services) == 0 {
		services = append(services, fmt.Sprintf("%d open ports", len(openPorts)))
	}

	return deviceType, services
}

// GetLocalNetwork gets the local network information
func GetLocalNetwork() (string, string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", "", err
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				localIP := ipnet.IP.String()
				network := ipnet.String()
				return localIP, network, nil
			}
		}
	}

	return "", "", fmt.Errorf("no local network found")
}

// GetDefaultGateway gets the default gateway for different OS
func GetDefaultGateway() (string, error) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/C", "route print 0.0.0.0 | findstr 0.0.0.0")
	case "darwin":
		cmd = exec.Command("sh", "-c", "netstat -nr | grep default | awk '{print $2}' | head -1")
	case "linux":
		cmd = exec.Command("sh", "-c", "ip route | grep default | awk '{print $3}' | head -1")
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	output, err := cmd.Output()
	if err != nil {
		return "", err
	}

	gateway := strings.TrimSpace(string(output))

	if runtime.GOOS == "windows" {
		fields := strings.Fields(gateway)
		if len(fields) >= 3 {
			gateway = fields[2]
		}
	}

	return gateway, nil
}

// ScanNetwork performs a comprehensive network scan
func ScanNetwork() (*NetworkScanResult, error) {
	// Load OUI database if not already loaded
	if !ouiLoaded {
		LoadOUIDatabase()
	}

	result := &NetworkScanResult{
		ScanTime: time.Now().Format("2006-01-02 15:04:05"),
	}

	localIP, network, err := GetLocalNetwork()
	if err != nil {
		return nil, err
	}

	result.LocalIP = localIP
	result.Network = network

	gateway, err := GetDefaultGateway()
	if err == nil {
		result.Gateway = gateway
	}

	fmt.Println("Scanning devices from ARP cache and enhancing with detailed info...")

	// Get devices from ARP cache
	arpDevices, _ := scanARP()
	
	// Enhance each device with detailed information
	var enhancedDevices []Device
	var wg sync.WaitGroup
	var mu sync.Mutex
	
	semaphore := make(chan struct{}, 10) // Process 10 devices concurrently

	for _, device := range arpDevices {
		wg.Add(1)
		go func(dev Device) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Skip if no valid IP
			if dev.IP == "" {
				return
			}

			fmt.Printf("Enhancing device: %s\n", dev.IP)
			
			// Use timeout for entire device enhancement
			enhanceDone := make(chan bool, 1)
			
			go func() {
				// Ping to check if online
				if pingHost(dev.IP) {
					dev.Status = "online"
				} else {
					dev.Status = "offline"
				}

				// Get vendor (with proper MAC normalization)
				if dev.MAC != "" && dev.MAC != "(incomplete)" {
					dev.Vendor = GetVendorFromMAC(dev.MAC)
				} else {
					dev.Vendor = "Unknown"
				}

				// Get enhanced hostname
				hostname := GetEnhancedHostname(dev.IP)
				if hostname != "Unknown" {
					dev.Hostname = hostname
				}

				// Only scan ports for online devices to save time
				if dev.Status == "online" {
					dev.OpenPorts = ScanPorts(dev.IP)
				}

				// Identify device type
				deviceType, services := IdentifyDeviceType(dev.IP, dev.MAC, dev.Vendor, dev.Hostname, dev.OpenPorts)
				dev.DeviceType = deviceType
				dev.Services = services
				
				enhanceDone <- true
			}()
			
			// Wait max 8 seconds per device
			select {
			case <-enhanceDone:
				mu.Lock()
				enhancedDevices = append(enhancedDevices, dev)
				mu.Unlock()
				fmt.Printf("✅ Enhanced device: %s\n", dev.IP)
			case <-time.After(8 * time.Second):
				fmt.Printf("⚠️  Timeout enhancing device: %s\n", dev.IP)
				mu.Lock()
				dev.Status = "timeout"
				dev.DeviceType = "Unknown (timeout)"
				enhancedDevices = append(enhancedDevices, dev)
				mu.Unlock()
			}
		}(device)
	}

	wg.Wait()

	result.Devices = enhancedDevices
	result.TotalDevices = len(enhancedDevices)

	fmt.Printf("Scan complete. Enhanced %d devices.\n", len(enhancedDevices))
	return result, nil
}

func pingSubnetEnhanced(localIP, network, gateway string) []Device {
	var devices []Device

	_, ipNet, err := net.ParseCIDR(network)
	if err != nil {
		return devices
	}

	ips := getAllIPsInSubnet(ipNet)
	fmt.Printf("Starting enhanced subnet scan of %d IPs...\n", len(ips))

	type scanResult struct {
		device Device
		found  bool
	}

	resultChan := make(chan scanResult, len(ips))
	semaphore := make(chan struct{}, 30) // Limit concurrent operations

	for _, ip := range ips {
		if ip == localIP {
			continue
		}

		go func(targetIP string) {
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			if pingHost(targetIP) {
				device := Device{
					IP:       targetIP,
					Status:   "online",
					LastSeen: time.Now().Format("2006-01-02 15:04:05"),
				}

				// Get MAC from ARP
				time.Sleep(10 * time.Millisecond)
				mac := getMACFromARP(targetIP)
				device.MAC = mac

				// Get vendor
				device.Vendor = GetVendorFromMAC(mac)

				// Get hostname
				device.Hostname = GetEnhancedHostname(targetIP)

				// Scan ports
				device.OpenPorts = ScanPorts(targetIP)

				// Identify device type
				deviceType, services := IdentifyDeviceType(targetIP, mac, device.Vendor, device.Hostname, device.OpenPorts)
				device.DeviceType = deviceType
				device.Services = services

				resultChan <- scanResult{device: device, found: true}
			} else {
				resultChan <- scanResult{found: false}
			}
		}(ip)
	}

	scanned := 0
	for scanned < len(ips)-1 {
		result := <-resultChan
		scanned++

		if scanned%50 == 0 {
			fmt.Printf("Progress: %d/%d IPs scanned\n", scanned, len(ips)-1)
		}

		if result.found {
			devices = append(devices, result.device)
		}
	}

	fmt.Printf("Enhanced scan complete. Found %d online devices.\n", len(devices))
	return devices
}

// scanARP uses ARP to discover devices (cross-platform)
func scanARP() ([]Device, error) {
	var devices []Device
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("arp", "-a")
	case "darwin":
		cmd = exec.Command("arp", "-a")
	case "linux":
		cmd = exec.Command("sh", "-c", "ip neigh show || arp -a")
	default:
		return nil, fmt.Errorf("unsupported operating system")
	}

	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		device := parseARPLine(line)
		if device.IP == "" {
			continue
		}

		device.Status = "unknown"
		device.LastSeen = time.Now().Format("2006-01-02 15:04:05")
		devices = append(devices, device)
	}

	return devices, nil
}

func parseARPLine(line string) Device {
	var device Device

	switch runtime.GOOS {
	case "windows":
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			ip := fields[0]
			if net.ParseIP(ip) != nil && !isMulticastOrBroadcast(ip) {
				device.IP = ip
				device.MAC = normalizeMACAddress(fields[1])
			}
		}

	case "darwin":
		parts := strings.Fields(line)
		if len(parts) >= 4 {
			ipStr := strings.Trim(parts[1], "()")
			if net.ParseIP(ipStr) != nil && !isMulticastOrBroadcast(ipStr) {
				device.IP = ipStr
			}

			for i, part := range parts {
				if part == "at" && i+1 < len(parts) {
					device.MAC = normalizeMACAddress(parts[i+1])
					break
				}
			}
		}

	case "linux":
		parts := strings.Fields(line)

		if strings.Contains(line, "lladdr") {
			if len(parts) >= 5 {
				ip := parts[0]
				if net.ParseIP(ip) != nil && !isMulticastOrBroadcast(ip) {
					device.IP = ip
					for i, part := range parts {
						if part == "lladdr" && i+1 < len(parts) {
							device.MAC = normalizeMACAddress(parts[i+1])
							break
						}
					}
				}
			}
		} else if strings.Contains(line, " at ") {
			if len(parts) >= 4 {
				ipStr := strings.Trim(parts[1], "()")
				if net.ParseIP(ipStr) != nil && !isMulticastOrBroadcast(ipStr) {
					device.IP = ipStr
				}
				for i, part := range parts {
					if part == "at" && i+1 < len(parts) {
						device.MAC = normalizeMACAddress(parts[i+1])
						break
					}
				}
			}
		}
	}

	return device
}

// isMulticastOrBroadcast checks if IP is multicast, broadcast, or special address
func isMulticastOrBroadcast(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return true
	}
	
	// Filter out multicast (224.0.0.0 - 239.255.255.255)
	if parsedIP.IsMulticast() {
		return true
	}
	
	// Filter out broadcast addresses
	if strings.HasSuffix(ip, ".255") || ip == "255.255.255.255" {
		return true
	}
	
	// Filter out loopback
	if parsedIP.IsLoopback() {
		return true
	}
	
	return false
}

// normalizeMACAddress ensures MAC address is in proper format with leading zeros
func normalizeMACAddress(mac string) string {
	if mac == "" || mac == "(incomplete)" {
		return mac
	}

	// Replace dashes with colons
	mac = strings.ReplaceAll(mac, "-", ":")
	
	// Split into parts
	parts := strings.Split(mac, ":")
	
	// Pad each part with leading zero if needed
	for i, part := range parts {
		if len(part) == 1 {
			parts[i] = "0" + part
		}
	}
	
	// Join back together
	return strings.ToUpper(strings.Join(parts, ":"))
}

func pingHost(ip string) bool {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("ping", "-n", "1", "-w", "1000", ip)
	case "darwin", "linux":
		cmd = exec.Command("ping", "-c", "1", "-W", "1", ip)
	default:
		return false
	}

	err := cmd.Run()
	return err == nil
}

func getMACFromARP(targetIP string) string {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("arp", "-a", targetIP)
	case "darwin":
		cmd = exec.Command("arp", "-n", targetIP)
	case "linux":
		cmd = exec.Command("sh", "-c", fmt.Sprintf("ip neigh show %s || arp -n %s", targetIP, targetIP))
	default:
		return ""
	}

	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	line := string(output)
	device := parseARPLine(line)
	return device.MAC
}

func getAllIPsInSubnet(ipNet *net.IPNet) []string {
	var ips []string

	ip := ipNet.IP.To4()
	if ip == nil {
		return ips
	}

	mask := ipNet.Mask
	network := ip.Mask(mask)
	broadcast := make(net.IP, 4)
	for i := range ip {
		broadcast[i] = network[i] | ^mask[i]
	}

	for ip := incrementIP(network); !ip.Equal(broadcast); ip = incrementIP(ip) {
		ips = append(ips, ip.String())
	}

	return ips
}

func incrementIP(ip net.IP) net.IP {
	newIP := make(net.IP, len(ip))
	copy(newIP, ip)

	for i := len(newIP) - 1; i >= 0; i-- {
		newIP[i]++
		if newIP[i] > 0 {
			break
		}
	}

	return newIP
}

// ContinuousScan performs continuous network monitoring
func ContinuousScan(interval time.Duration, callback func(*NetworkScanResult)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		result, err := ScanNetwork()
		if err == nil && callback != nil {
			callback(result)
		}
	}
}