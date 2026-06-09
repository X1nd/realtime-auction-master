package middleware

import (
	"time"

	"realtime-auction-backend/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const RequestIDKey = "requestId"

// AccessLog logs every HTTP request with structured fields.
func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestId := c.GetHeader("X-Request-ID")
		if requestId == "" {
			requestId = uuid.New().String()[:8]
		}
		c.Set(RequestIDKey, requestId)
		c.Header("X-Request-ID", requestId)

		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method
		userId := c.GetInt64("userId")

		fields := []interface{}{
			"rid", requestId,
			"status", status,
			"latency", latency.String(),
			"ip", clientIP,
			"method", method,
			"path", path,
		}
		if query != "" {
			fields = append(fields, "query", query)
		}
		if userId > 0 {
			fields = append(fields, "userId", userId)
		}
		if ua := c.GetHeader("User-Agent"); ua != "" && len(ua) < 100 {
			fields = append(fields, "ua", ua)
		}

		if status >= 500 {
			logger.SugarLogger.Errorw("HTTP 请求", fields...)
		} else if status >= 400 {
			logger.SugarLogger.Warnw("HTTP 请求", fields...)
		} else {
			logger.SugarLogger.Infow("HTTP 请求", fields...)
		}
	}
}
