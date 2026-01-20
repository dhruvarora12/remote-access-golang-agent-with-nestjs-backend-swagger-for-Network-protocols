package executor

import (
	"os/exec"
	"runtime"
)

type CommandResult struct {
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}

func ExecuteCommand(command string) *CommandResult {
	var cmd *exec.Cmd

	// Use appropriate shell based on OS
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", command)
	} else {
		// macOS and Linux use sh
		cmd = exec.Command("sh", "-c", command)
	}

	// Run command and capture output
	output, err := cmd.CombinedOutput()

	result := &CommandResult{
		Output: string(output),
	}

	if err != nil {
		result.Error = err.Error()
	}

	return result
}