package middleware

import (
	"fmt"
	"net/http"
	"realtime-auction-backend/pkg/database"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimit returns a middleware that limits requests per window using Redis sliding window.
func RateLimit(window time.Duration, maxRequests int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := database.GetRedisContext()
		clientIP := c.ClientIP()
		key := fmt.Sprintf("ratelimit:%s:%s", c.FullPath(), clientIP)

		count, err := database.RedisClient.Incr(ctx, key).Result()
		if err != nil {
			// Redis unavailable — fail open
			c.Next()
			return
		}

		if count == 1 {
			database.RedisClient.Expire(ctx, key, window)
		}

		if count > int64(maxRequests) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "请求过于频繁，请稍后重试",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
