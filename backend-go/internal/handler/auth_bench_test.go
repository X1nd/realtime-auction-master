package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"realtime-auction-backend/config"
	"realtime-auction-backend/internal/middleware"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func setupBench(t *testing.T) *gin.Engine {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{
		NodeEnv:            "test",
		Port:               3000,
		SocketPort:         3001,
		DB:                 config.DBConfig{Host: "localhost", Port: 3306, Database: "auction_master", Username: "root", Password: "123456"},
		Redis:              config.RedisConfig{Host: "localhost", Port: 6379, Password: "", DB: 14},
		JWT:                config.JWTConfig{Secret: "bench-secret", ExpiresIn: "15m", RefreshExpiresIn: "168h"},
		RedisKeyPrefix:     "bench:",
		BidQueueBufferSize: 1024,
	}
	config.GlobalConfig = cfg
	logger.InitLogger(true)

	if database.RedisClient == nil {
		if err := database.InitRedis(cfg); err != nil {
			t.Skipf("Redis不可用，跳过测试: %v", err)
		}
	}
	if database.DB == nil {
		if err := database.InitMySQL(cfg); err != nil {
			t.Skipf("MySQL不可用，跳过测试: %v", err)
		}
	}

	return gin.New()
}

func ensureBenchUser(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)
	user := model.User{
		Username:     "benchuser",
		PasswordHash: string(hash),
		Nickname:     "bench",
		Role:         "user",
	}
	database.DB.Where("username = ?", "benchuser").FirstOrCreate(&user)
}

// Test login lockout after 5 failures (L1)
func TestLoginLockout(t *testing.T) {
	r := setupBench(t)
	r.POST("/api/auth/login", Login)
	ensureBenchUser(t)

	// Clear any previous attempts
	ctx := database.GetRedisContext()
	database.RedisClient.Del(ctx, "login_attempts:benchuser")

	body := []byte(`{"username":"benchuser","password":"wrong"}`)

	// 5 failed attempts
	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != 401 {
			t.Errorf("attempt %d: expected 401, got %d", i+1, w.Code)
		}
	}

	// 6th attempt should be rate limited
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 429 {
		t.Errorf("expected 429 after lockout, got %d", w.Code)
	}
	t.Log("L1登录锁定测试通过: 5次失败后第6次返回429")

	// Cleanup
	database.RedisClient.Del(ctx, "login_attempts:benchuser")
}

// Test token refresh and logout lifecycle (L2)
func TestTokenLifecycle(t *testing.T) {
	r := setupBench(t)
	r.POST("/api/auth/login", Login)
	r.POST("/api/auth/refresh", RefreshToken)
	r.POST("/api/auth/logout", Logout)
	ensureBenchUser(t)

	// 1. Login to get tokens
	loginBody := []byte(`{"username":"benchuser","password":"123456"}`)
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("login failed: %d, %s", w.Code, w.Body.String())
	}

	var loginResp struct {
		Success bool
		Data    struct {
			AccessToken  string `json:"accessToken"`
			RefreshToken string `json:"refreshToken"`
		}
	}
	json.Unmarshal(w.Body.Bytes(), &loginResp)

	if loginResp.Data.AccessToken == "" || loginResp.Data.RefreshToken == "" {
		t.Fatal("没有获取到accessToken或refreshToken")
	}
	t.Log("L2-1 登录获取双token通过")

	// 2. Refresh to get new tokens
	refreshBody, _ := json.Marshal(map[string]string{"refreshToken": loginResp.Data.RefreshToken})
	req, _ = http.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(refreshBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("refresh failed: %d, %s", w.Code, w.Body.String())
	}
	t.Log("L2-2 token刷新通过")

	var refreshResp struct {
		Success bool
		Data    struct {
			AccessToken  string `json:"accessToken"`
			RefreshToken string `json:"refreshToken"`
		}
	}
	json.Unmarshal(w.Body.Bytes(), &refreshResp)

	// 3. Reuse same refresh token should fail (rotation)
	req, _ = http.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(refreshBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code == 200 {
		t.Error("refresh token应一次性使用，重复使用应被拒绝")
	}
	t.Log("L2-3 refresh token轮换验证通过: 重复使用被拒绝")

	// 4. Logout
	req, _ = http.NewRequest("POST", "/api/auth/logout", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", refreshResp.Data.AccessToken))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("logout failed: %d", w.Code)
	}
	t.Log("L2-4 登出通过")
}

// Test bid API rate limiting (L4)
func TestBidRateLimit(t *testing.T) {
	r := setupBench(t)
	r.POST("/api/bid", middleware.RateLimit(1*time.Second, 2), func(c *gin.Context) {
		c.JSON(200, gin.H{"success": true})
	})

	const rapidBids = 10
	var codes []int

	for i := 0; i < rapidBids; i++ {
		req, _ := http.NewRequest("POST", "/api/bid", nil)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		codes = append(codes, w.Code)
	}

	limited := 0
	for _, c := range codes {
		if c == 429 {
			limited++
		}
	}

	t.Logf("L4出价限流: 10次快速请求, 限流拦截=%d次", limited)
	if limited == 0 {
		t.Error("期望至少部分请求被限流(429)")
	}
}

// Concurrent login stress (L1)
func TestConcurrentLogin(t *testing.T) {
	r := setupBench(t)
	r.POST("/api/auth/login", Login)
	ensureBenchUser(t)

	const concurrency = 20
	results := make(chan int, concurrency)

	for i := 0; i < concurrency; i++ {
		go func() {
			body := []byte(`{"username":"benchuser","password":"123456"}`)
			req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			results <- w.Code
		}()
	}

	ok, fail := 0, 0
	for i := 0; i < concurrency; i++ {
		code := <-results
		if code == 200 {
			ok++
		} else {
			fail++
		}
	}

	t.Logf("L1并发登录压测: 成功=%d, 失败=%d, 总计=%d", ok, fail, concurrency)
	if ok == 0 {
		t.Error("所有请求都失败了")
	}
}
