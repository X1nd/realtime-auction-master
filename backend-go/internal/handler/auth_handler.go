package handler

import (
	"fmt"
	"net/http"
	"realtime-auction-backend/config"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

func Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required,min=2,max=50"`
		Password string `json:"password" binding:"required,min=6,max=100"`
		Nickname string `json:"nickname"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}

	var existing model.User
	if err := database.DB.Where("username = ?", req.Username).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "用户名已存在"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "密码加密失败"})
		return
	}

	user := model.User{
		Username:     req.Username,
		PasswordHash: string(hash),
		Nickname:     req.Nickname,
		Role:         "user",
	}

	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "注册失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    gin.H{"id": user.ID, "username": user.Username, "nickname": user.Nickname, "role": user.Role},
	})
}

func generateAccessToken(userId int64, username string, role string) (string, error) {
	expiresIn, _ := time.ParseDuration(config.GlobalConfig.JWT.ExpiresIn)
	now := time.Now()
	claims := jwt.MapClaims{
		"userId":   userId,
		"username": username,
		"role":     role,
		"type":     "access",
		"iat":      now.Unix(),
		"jti":      fmt.Sprintf("%d-%d", userId, now.UnixNano()),
		"exp":      now.Add(expiresIn).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.GlobalConfig.JWT.Secret))
}

func generateRefreshToken(userId int64, username string, role string) (string, error) {
	expiresIn, _ := time.ParseDuration(config.GlobalConfig.JWT.RefreshExpiresIn)
	now := time.Now()
	claims := jwt.MapClaims{
		"userId":   userId,
		"username": username,
		"role":     role,
		"type":     "refresh",
		"iat":      now.Unix(),
		"jti":      fmt.Sprintf("%d-%d", userId, now.UnixNano()),
		"exp":      now.Add(expiresIn).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.GlobalConfig.JWT.Secret))
}

func generateTokenPair(userId int64, username string, role string) (string, string, error) {
	accessToken, err := generateAccessToken(userId, username, role)
	if err != nil {
		return "", "", err
	}
	refreshToken, err := generateRefreshToken(userId, username, role)
	if err != nil {
		return "", "", err
	}
	return accessToken, refreshToken, nil
}

// blacklistToken adds a token to the Redis blacklist with TTL equal to remaining validity
func blacklistToken(tokenStr string) {
	claims, err := parseTokenClaims(tokenStr)
	if err != nil {
		return
	}
	ctx := database.GetRedisContext()
	jti, _ := claims["jti"].(string)
	if jti == "" {
		return
	}
	exp, _ := claims["exp"].(float64)
	remaining := time.Until(time.Unix(int64(exp), 0))
	if remaining > 0 {
		key := "token:blacklist:" + jti
		database.RedisClient.Set(ctx, key, "1", remaining)
	}
}

func parseTokenClaims(tokenStr string) (jwt.MapClaims, error) {
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

func DevToken(c *gin.Context) {
	// 开发环境：自动创建测试用户并返回 JWT
	// 支持 ?username= 和 ?role= 参数
	username := c.DefaultQuery("username", "testuser")
	role := c.DefaultQuery("role", "user")
	password := "123456"

	var user model.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		user = model.User{Username: username, PasswordHash: string(hash), Nickname: username, Role: role}
		database.DB.Create(&user)
	} else if user.Role != role {
		user.Role = role
		database.DB.Save(&user)
	}

	accessToken, refreshToken, err := generateTokenPair(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "令牌生成失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"accessToken":  accessToken,
			"refreshToken": refreshToken,
			"expiresIn":    config.GlobalConfig.JWT.ExpiresIn,
			"userId":       user.ID,
			"username":     user.Username,
			"nickname":     user.Nickname,
			"role":         user.Role,
		},
	})
}

func ListUsers(c *gin.Context) {
	var users []model.User
	database.DB.Order("id ASC").Find(&users)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": users})
}

func UpdateUserNickname(c *gin.Context) {
	var req struct {
		UserID   int64  `json:"userId" binding:"required"`
		Nickname string `json:"nickname" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
		return
	}
	database.DB.Model(&model.User{}).Where("id = ?", req.UserID).Update("nickname", req.Nickname)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "昵称已更新"})
}

func GetMe(c *gin.Context) {
	userId := c.GetInt64("userId")

	var user model.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    user,
	})
}

func Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
		return
	}

	// L1: Login rate limiting via Redis
	ctx := database.GetRedisContext()
	attemptKey := fmt.Sprintf("login_attempts:%s", req.Username)
	attempts, _ := database.RedisClient.Get(ctx, attemptKey).Int()
	if attempts >= 5 {
		logger.AuditLoginLocked(req.Username, c.ClientIP())
			c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "登录失败次数过多，请15分钟后再试"})
		return
	}

	var user model.User
	if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "用户名或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		logger.AuditLoginFailed(req.Username, "wrong_password", c.ClientIP())
		pipe := database.RedisClient.Pipeline()
		pipe.Incr(ctx, attemptKey)
		pipe.Expire(ctx, attemptKey, 15*time.Minute)
		pipe.Exec(ctx)
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "用户名或密码错误"})
		return
	}

	// Clear failed attempts on success
	database.RedisClient.Del(ctx, attemptKey)
	logger.AuditLoginSuccess(user.ID, user.Username, user.Role, c.ClientIP())

	accessToken, refreshToken, err := generateTokenPair(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "令牌生成失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"accessToken":  accessToken,
			"refreshToken": refreshToken,
			"expiresIn":    config.GlobalConfig.JWT.ExpiresIn,
			"user":         gin.H{"id": user.ID, "username": user.Username, "nickname": user.Nickname, "role": user.Role},
		},
	})
}

func RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
		return
	}

	claims, err := parseTokenClaims(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "令牌无效或已过期"})
		return
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "refresh" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "令牌类型错误"})
		return
	}

	// Rotate: blacklist the used refresh token
	jti, _ := claims["jti"].(string)
	ctx := database.GetRedisContext()
	key := "token:blacklist:" + jti
	exists, _ := database.RedisClient.Exists(ctx, key).Result()
	if exists > 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "令牌已被使用"})
		return
	}
	blacklistToken(req.RefreshToken)

	userId := int64(claims["userId"].(float64))
	logger.AuditTokenRefresh(userId, c.ClientIP())

	var user model.User
	if err := database.DB.First(&user, userId).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "用户不存在"})
		return
	}

	accessToken, refreshToken, err := generateTokenPair(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "令牌生成失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"accessToken":  accessToken,
			"refreshToken": refreshToken,
			"expiresIn":    config.GlobalConfig.JWT.ExpiresIn,
			"user":         gin.H{"id": user.ID, "username": user.Username, "nickname": user.Nickname, "role": user.Role},
		},
	})
}

func Logout(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" && len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		tokenStr := authHeader[7:]
		claims, err := parseTokenClaims(tokenStr)
		if err == nil {
			if uid, ok := claims["userId"].(float64); ok {
				logger.AuditLogout(int64(uid), c.ClientIP())
			}
		}
		blacklistToken(tokenStr)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "已登出"})
}
