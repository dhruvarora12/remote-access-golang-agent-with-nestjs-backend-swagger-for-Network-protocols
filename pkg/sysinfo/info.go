package sysinfo

import (
	"runtime"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

type SystemInfo struct {
	OS          string             `json:"os"`
	Arch        string             `json:"arch"`
	Hostname    string             `json:"hostname"`
	Platform    string             `json:"platform"`
	Uptime      uint64             `json:"uptime"`           // ✅ NEW: System uptime in seconds
	BootTime    uint64             `json:"boot_time"`        // ✅ NEW: Unix timestamp of last boot
	KernelVersion string           `json:"kernel_version"`   // ✅ NEW: Kernel version
	CPU         CPUInfo            `json:"cpu"`
	Memory      MemoryInfo         `json:"memory"`
	Disk        DiskInfo           `json:"disk"`
	Network     []NetworkInterface `json:"network"`
	Processes   ProcessInfo        `json:"processes"`        // ✅ NEW: Process information
}

type CPUInfo struct {
	Model       string    `json:"model"`
	Cores       int       `json:"cores"`
	Usage       float64   `json:"usage"`
	PerCoreUsage []float64 `json:"per_core_usage,omitempty"` // ✅ NEW: Usage per core
}

type MemoryInfo struct {
	Total     uint64  `json:"total"`
	Available uint64  `json:"available"`
	Used      uint64  `json:"used"`
	Percent   float64 `json:"percent"`
	Swap      SwapInfo `json:"swap"` // ✅ NEW: Swap memory info
}

type SwapInfo struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Free    uint64  `json:"free"`
	Percent float64 `json:"percent"`
}

type DiskInfo struct {
	Total      uint64  `json:"total"`
	Free       uint64  `json:"free"`
	Used       uint64  `json:"used"`
	Percent    float64 `json:"percent"`
	IOCounters DiskIO  `json:"io_counters,omitempty"` // ✅ NEW: Disk I/O stats
}

type DiskIO struct {
	ReadCount  uint64 `json:"read_count"`
	WriteCount uint64 `json:"write_count"`
	ReadBytes  uint64 `json:"read_bytes"`
	WriteBytes uint64 `json:"write_bytes"`
}

type NetworkInterface struct {
	Name       string      `json:"name"`
	Addrs      []string    `json:"addrs"`
	MacAddress string      `json:"mac_address,omitempty"`
	Status     string      `json:"status,omitempty"`     // ✅ NEW: up/down status
	Speed      int         `json:"speed,omitempty"`      // ✅ NEW: Speed in Mbps
	MTU        int         `json:"mtu,omitempty"`        // ✅ NEW: MTU size
	Stats      *NetStats   `json:"stats,omitempty"`      // ✅ NEW: Network statistics
}

type NetStats struct {
	BytesSent   uint64 `json:"bytes_sent"`
	BytesRecv   uint64 `json:"bytes_recv"`
	PacketsSent uint64 `json:"packets_sent"`
	PacketsRecv uint64 `json:"packets_recv"`
	Errin       uint64 `json:"errors_in"`
	Errout      uint64 `json:"errors_out"`
	Dropin      uint64 `json:"drop_in"`
	Dropout     uint64 `json:"drop_out"`
}

type ProcessInfo struct {
	Total   int `json:"total"`    // ✅ NEW: Total number of processes
	Running int `json:"running"`  // ✅ NEW: Running processes
	Sleeping int `json:"sleeping"` // ✅ NEW: Sleeping processes
}

func GetSystemInfo() (*SystemInfo, error) {
	hostInfo, err := host.Info()
	if err != nil {
		return nil, err
	}

	cpuInfo, err := cpu.Info()
	if err != nil {
		return nil, err
	}
	cpuPercent, _ := cpu.Percent(0, false)
	perCorePercent, _ := cpu.Percent(0, true) // ✅ NEW: Get per-core usage

	memInfo, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}

	// ✅ NEW: Get swap memory info
	swapInfo, _ := mem.SwapMemory()

	diskInfo, err := disk.Usage("/")
	if err != nil {
		return nil, err
	}

	// ✅ NEW: Get disk I/O counters
	diskIOCounters, _ := disk.IOCounters()
	var diskIO DiskIO
	if len(diskIOCounters) > 0 {
		// Get the first disk's stats (usually the main disk)
		for _, io := range diskIOCounters {
			diskIO = DiskIO{
				ReadCount:  io.ReadCount,
				WriteCount: io.WriteCount,
				ReadBytes:  io.ReadBytes,
				WriteBytes: io.WriteBytes,
			}
			break
		}
	}

	netInterfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	// ✅ NEW: Get network I/O statistics
	netIOCounters, _ := net.IOCounters(true) // true = per interface
	netStatsMap := make(map[string]*NetStats)
	for _, io := range netIOCounters {
		netStatsMap[io.Name] = &NetStats{
			BytesSent:   io.BytesSent,
			BytesRecv:   io.BytesRecv,
			PacketsSent: io.PacketsSent,
			PacketsRecv: io.PacketsRecv,
			Errin:       io.Errin,
			Errout:      io.Errout,
			Dropin:      io.Dropin,
			Dropout:     io.Dropout,
		}
	}

	var networks []NetworkInterface
	for _, iface := range netInterfaces {
		var addrs []string
		for _, addr := range iface.Addrs {
			addrs = append(addrs, addr.Addr)
		}
		
		// Determine interface status
		status := "down"
		for _, flag := range iface.Flags {
			if flag == "up" {
				status = "up"
				break
			}
		}

		networks = append(networks, NetworkInterface{
			Name:       iface.Name,
			Addrs:      addrs,
			MacAddress: iface.HardwareAddr,
			Status:     status,           // ✅ NEW     
			MTU:        iface.MTU,        // ✅ NEW
			Stats:      netStatsMap[iface.Name], // ✅ NEW
		})
	}

	// ✅ NEW: Get process information
	processes, _ := process.Processes()
	processInfo := ProcessInfo{
		Total: len(processes),
	}
	for _, p := range processes {
		status, err := p.Status()
		if err == nil {
			switch status[0] {
			case "R":
				processInfo.Running++
			case "S":
				processInfo.Sleeping++
			}
		}
	}

	sysInfo := &SystemInfo{
		OS:            runtime.GOOS,
		Arch:          runtime.GOARCH,
		Hostname:      hostInfo.Hostname,
		Platform:      hostInfo.Platform,
		Uptime:        hostInfo.Uptime,           // ✅ NEW
		BootTime:      hostInfo.BootTime,         // ✅ NEW
		KernelVersion: hostInfo.KernelVersion,    // ✅ NEW
		CPU: CPUInfo{
			Model:        cpuInfo[0].ModelName,
			Cores:        runtime.NumCPU(),
			Usage:        cpuPercent[0],
			PerCoreUsage: perCorePercent,          // ✅ NEW
		},
		Memory: MemoryInfo{
			Total:     memInfo.Total,
			Available: memInfo.Available,
			Used:      memInfo.Used,
			Percent:   memInfo.UsedPercent,
			Swap: SwapInfo{                        // ✅ NEW
				Total:   swapInfo.Total,
				Used:    swapInfo.Used,
				Free:    swapInfo.Free,
				Percent: swapInfo.UsedPercent,
			},
		},
		Disk: DiskInfo{
			Total:      diskInfo.Total,
			Free:       diskInfo.Free,
			Used:       diskInfo.Used,
			Percent:    diskInfo.UsedPercent,
			IOCounters: diskIO,                    // ✅ NEW
		},
		Network:   networks,
		Processes: processInfo,                    // ✅ NEW
	}

	return sysInfo, nil
}