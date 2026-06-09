package middleware

import (
	"fmt"
	"net/http"
	"realtime-auction-backend/config"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "缺少认证令牌"})
			c.Abort()
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "认证格式错误"})
			c.Abort()
			return
		}

		// L2: Check token blacklist
		claims, err := parseClaims(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "令牌无效或已过期"})
			c.Abort()
			return
		}

		tokenType, _ := claims["type"].(string)
		if tokenType != "access" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "令牌类型错误"})
			c.Abort()
			return
		}

		jti, _ := claims["jti"].(string)
		if jti != "" {
			ctx := database.GetRedisContext()
			key := "token:blacklist:" + jti
			exists, _ := database.RedisClient.Exists(ctx, key).Result()
			if exists > 0 {
				c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "令牌已失效"})
				c.Abort()
				return
			}
		}

		userId, _ := claims["userId"].(float64)
		c.Set("userId", int64(userId))
		c.Set("role", claims["role"])
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		roleStr := fmt.Sprintf("%v", role)
		for _, r := range roles {
			if r == roleStr {
				c.Next()
				return
			}
		}
		logger.AuditPermissionDenied(c.GetInt64("userId"), roleStr, c.Request.URL.Path,
			fmt.Sprintf("需要角色: %v", roles))
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "权限不足"})
		c.Abort()
	}
}

func parseClaims(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.GlobalConfig.JWT.Secret), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}
	return claims, nil
}
