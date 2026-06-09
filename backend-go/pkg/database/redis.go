package database

import (
	"context"
	"fmt"
	"realtime-auction-backend/config"
	"realtime-auction-backend/pkg/logger"
	"time"

	"github.com/go-redis/redis/v8"
)

var RedisClient *redis.Client
var redisCtx = context.Background()

func InitRedis(cfg *config.Config) error {
	client := redis.NewClient(&redis.Options{
		Addr:        fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port),
		Password:    cfg.Redis.Password,
		DB:          cfg.Redis.DB,
		PoolSize:    cfg.RedisPoolSize,
		PoolTimeout: 3 * time.Second,
	})

	if err := client.Ping(redisCtx).Err(); err != nil {
		return fmt.Errorf("Redis连接失败: %w", err)
	}

	RedisClient = client
	logger.SugarLogger.Info("✅ Redis连接成功 Ping测试通过")
	return nil
}

func GetRedisContext() context.Context {
	return redisCtx
}
