package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"realtime-auction-backend/config"

	"github.com/gin-gonic/gin"
)

var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

func UploadImage(c *gin.Context) {
	cfg := config.GlobalConfig

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请选择文件"})
		return
	}
	defer file.Close()

	// Validate MIME type
	contentType := header.Header.Get("Content-Type")
	if !allowedImageTypes[contentType] {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "不支持的图片格式，仅支持 JPG/PNG/GIF/WebP"})
		return
	}

	// Validate size
	maxSize := int64(cfg.MaxUploadSizeMB) * 1024 * 1024
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("图片大小不能超过 %dMB", cfg.MaxUploadSizeMB),
		})
		return
	}

	// Ensure upload directory exists
	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "服务器存储异常"})
		return
	}

	// Generate unique filename: YYYYMMDD/uuid.ext
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" || ext == ".jpg" {
		ext = ".jpg" // normalize
	}
	dateDir := time.Now().Format("20060102")
	fullDir := filepath.Join(cfg.UploadDir, dateDir)
	if err := os.MkdirAll(fullDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "服务器存储异常"})
		return
	}

	b := make([]byte, 16)
	rand.Read(b)
	filename := hex.EncodeToString(b) + ext
	savePath := filepath.Join(fullDir, filename)

	dst, err := os.Create(savePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "文件保存失败"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "文件写入失败"})
		return
	}

	// Return accessible URL
	url := fmt.Sprintf("/uploads/%s/%s", dateDir, filename)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    gin.H{"url": url},
	})
}
