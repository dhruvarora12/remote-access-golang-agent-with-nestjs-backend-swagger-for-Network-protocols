package fileops

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
)

type FileInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

type FileListResult struct {
	Path  string     `json:"path"`
	Files []FileInfo `json:"files"`
	Error string     `json:"error,omitempty"`
}

type FileReadResult struct {
	Path     string `json:"path"`
	Content  string `json:"content"` // base64 encoded
	Size     int64  `json:"size"`
	Error    string `json:"error,omitempty"`
}

type FileWriteResult struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// ListFiles lists files in a directory
func ListFiles(path string) *FileListResult {
	result := &FileListResult{Path: path}

	files, err := ioutil.ReadDir(path)
	if err != nil {
		result.Error = err.Error()
		return result
	}

	for _, f := range files {
		fileInfo := FileInfo{
			Name:    f.Name(),
			Path:    filepath.Join(path, f.Name()),
			Size:    f.Size(),
			IsDir:   f.IsDir(),
			ModTime: f.ModTime().Format("2006-01-02 15:04:05"),
		}
		result.Files = append(result.Files, fileInfo)
	}

	return result
}

// ReadFile reads a file and returns base64 encoded content
func ReadFile(path string) *FileReadResult {
	result := &FileReadResult{Path: path}

	data, err := ioutil.ReadFile(path)
	if err != nil {
		result.Error = err.Error()
		return result
	}

	result.Content = base64.StdEncoding.EncodeToString(data)
	result.Size = int64(len(data))

	return result
}

// WriteFile writes content to a file (content is base64 encoded)
func WriteFile(path string, contentBase64 string) *FileWriteResult {
	result := &FileWriteResult{Path: path}

	// Decode base64 content
	data, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to decode content: %v", err)
		return result
	}

	// Write to file
	err = ioutil.WriteFile(path, data, 0644)
	if err != nil {
		result.Error = err.Error()
		return result
	}

	result.Success = true
	return result
}

// DeleteFile deletes a file or directory
func DeleteFile(path string) *FileWriteResult {
	result := &FileWriteResult{Path: path}

	err := os.RemoveAll(path)
	if err != nil {
		result.Error = err.Error()
		return result
	}

	result.Success = true
	return result
}