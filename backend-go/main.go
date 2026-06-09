package main

import (
	"fmt"
	"net/http"
	"realtime-auction-backend/config"
	"realtime-auction-backend/internal/handler"
	"realtime-auction-backend/internal/middleware"
	"realtime-auction-backend/internal/service"
	"realtime-auction-backend/internal/websocket"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.LoadConfig()
	logger.InitLogger(logger.LogConfig{
		LogDir:   cfg.LogDir,
		LogLevel: cfg.LogLevel,
	})
	defer logger.Sync()

	logger.SugarLogger.Info("🚀 实时竞拍大师 - Go高性能后端启动中...")

	if err := database.InitMySQL(cfg); err != nil {
		logger.SugarLogger.Fatalf("MySQL初始化失败: %v", err)
	}

	if err := database.InitRedis(cfg); err != nil {
		logger.SugarLogger.Fatalf("Redis初始化失败: %v", err)
	}

	// Load Lua scripts for atomic bid processing
	if err := service.LoadScripts(); err != nil {
		logger.SugarLogger.Fatalf("Lua脚本加载失败: %v", err)
	}

	// Initialize async DB writer and bid queue manager
	dbWriter := service.NewAsyncDBWriter(cfg.AsyncDBWorkerCount, cfg.AsyncDBBufferSize)
	service.InitBidQueueManager(dbWriter).StartCleanup(5 * time.Minute)

	if cfg.NodeEnv != "production" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	corsConfig := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if cfg.NodeEnv == "development" {
		corsConfig.AllowOriginFunc = func(origin string) bool {
			return true // 开发环境允许所有来源
		}
	} else {
		corsConfig.AllowOriginFunc = func(origin string) bool {
		return true
	}
	}
	r.Use(cors.New(corsConfig))
	r.Use(middleware.AccessLog())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "实时竞拍大师 Go 版 API 服务运行正常",
			"mode":    cfg.NodeEnv,
		})
	})

	api := r.Group("/api")
	{
		api.POST("/auth/register", handler.Register)
		api.POST("/auth/login", middleware.RateLimit(1*time.Second, 5), handler.Login)
		api.POST("/auth/dev-token", handler.DevToken)
		api.POST("/auth/refresh", handler.RefreshToken)
		api.POST("/auth/logout", handler.Logout)
		api.GET("/auth/me", middleware.AuthRequired(), handler.GetMe)
	}

	auth := api.Group("")
	auth.Use(middleware.AuthRequired())
	{
		// 公开接口（所有已登录用户）
		auth.GET("/auctions", handler.ListAuctions)
		auth.GET("/auctions/:id", handler.GetAuction)
		auth.GET("/merchants/rooms", handler.ListMerchantRooms)
		auth.GET("/auctions/sequence", handler.GetSequence)
		auth.GET("/dashboard/stats", handler.GetDashboardStats)
		auth.GET("/orders", handler.ListOrders)
		auth.GET("/orders/me", handler.ListMyOrders)
		auth.GET("/orders/:id", handler.GetOrder)
		auth.POST("/orders/:id/pay", handler.PayOrder)
		auth.GET("/bids/me", handler.ListMyBids)

		// 出价接口：限流 1秒2次
		auth.POST("/bid", middleware.RateLimit(1*time.Second, 2), handler.PlaceBid)

		// 商家 + 管理员接口
		merchant := auth.Group("")
		merchant.Use(middleware.RequireRole("admin", "merchant"))
		{
			merchant.POST("/auctions", handler.CreateAuction)
			merchant.POST("/auctions/batch", handler.BatchCreateAuctions)
			merchant.POST("/auctions/:id/start", handler.StartAuction)
			merchant.POST("/auctions/:id/cancel", handler.CancelAuction)
			merchant.PUT("/auctions/:id", handler.UpdateAuction)
			merchant.PUT("/auctions/reorder", handler.ReorderAuctions)
			merchant.POST("/upload", handler.UploadImage)
		}

		// 管理员接口
		admin := auth.Group("")
		admin.Use(middleware.RequireRole("admin"))
		{
			admin.GET("/users", handler.ListUsers)
			admin.PUT("/users/nickname", handler.UpdateUserNickname)
			admin.DELETE("/auctions/clear", handler.ClearAuctions)
		}
	}

	socketServer := websocket.NewSocketServer()

	socketServer.OnBid = func(goodsId int64, userId int64) (map[string]interface{}, error) {
		stateData, err := service.ProcessBid(goodsId, userId)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"currentState":     string(stateData.CurrentState),
			"currentPrice":     stateData.CurrentPrice,
			"remainingMs":      stateData.RemainingMs,
			"participantCount": stateData.ParticipantCount,
			"latestBidderId":   stateData.LatestBidderId,
			"maxPrice":         stateData.MaxPrice,
			"incrementPrice":   stateData.IncrementPrice,
			"autoDelaySeconds": stateData.AutoDelaySeconds,
			"delayCount":       stateData.DelayCount,
			"maxDelayCount":    stateData.MaxDelayCount,
		}, nil
	}

	socketServer.OnGetState = func(goodsId int64) map[string]interface{} {
		d := service.GetOrRecoverAuctionState(goodsId)
		if d == nil {
			return nil
		}
		return map[string]interface{}{
			"currentState":     string(d.CurrentState),
			"currentPrice":     d.CurrentPrice,
			"remainingMs":      d.RemainingMs,
			"participantCount": d.ParticipantCount,
			"latestBidderId":   d.LatestBidderId,
			"maxPrice":         d.MaxPrice,
			"incrementPrice":   d.IncrementPrice,
			"autoDelaySeconds": d.AutoDelaySeconds,
			"delayCount":       d.DelayCount,
			"maxDelayCount":    d.MaxDelayCount,
		}
	}

	// 启动竞拍定时器（每2秒检查活跃拍卖的倒计时）
	go service.RunAuctionTimerLoop()

	// 静态文件服务：上传的图片
	r.Static("/uploads", cfg.UploadDir)

	wsMux := http.NewServeMux()
	wsMux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		socketServer.ServeHTTP(w, r)
	})

	go func() {
		addr := fmt.Sprintf(":%d", cfg.SocketPort)
		logger.SugarLogger.Infof("🌐 WebSocket 服务运行在 ws://localhost%s", addr)
		if err := http.ListenAndServe(addr, wsMux); err != nil {
			logger.SugarLogger.Fatalf("WebSocket服务启动失败: %v", err)
		}
	}()

	logger.SugarLogger.Infof("🚀 API 服务运行在 http://localhost:%d", cfg.Port)
	if err := r.Run(fmt.Sprintf(":%d", cfg.Port)); err != nil {
		logger.SugarLogger.Fatalf("API服务启动失败: %v", err)
	}
}
