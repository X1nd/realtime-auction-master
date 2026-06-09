package lock

import (
	"fmt"
	"realtime-auction-backend/config"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func setupTest() {
	cfg := &config.Config{
		NodeEnv: "test",
		Redis: config.RedisConfig{
			Host:     "localhost",
			Port:     6379,
			Password: "",
			DB:       15,
		},
		RedisKeyPrefix: "test:lock:",
	}
	config.GlobalConfig = cfg
	logger.InitLogger(true)

	if database.RedisClient == nil {
		_ = database.InitRedis(cfg)
	}
}

func cleanupTest() {
	if database.RedisClient != nil {
		ctx := database.GetRedisContext()
		database.RedisClient.FlushDB(ctx)
	}
}

func TestDistributedLock_BasicLockUnlock(t *testing.T) {
	setupTest()
	defer cleanupTest()

	ctx := database.GetRedisContext()
	lockKey := "test_basic_lock"
	lock := NewDistributedLock(lockKey, 5*time.Second)

	token, err := lock.Acquire()
	assert.NoError(t, err, "获取锁不应出错")
	assert.NotEmpty(t, token, "Token不应为空")

	exists, err := database.RedisClient.Exists(ctx, "lock:"+lockKey).Result()
	assert.NoError(t, err)
	assert.Equal(t, int64(1), exists, "Redis中锁key应存在")

	released := lock.Release(token)
	assert.True(t, released, "释放锁应成功")

	existsAfter, err := database.RedisClient.Exists(ctx, "lock:"+lockKey).Result()
	assert.NoError(t, err)
	assert.Equal(t, int64(0), existsAfter, "释放后锁key应消失")
}

func TestDistributedLock_ConcurrentSafe(t *testing.T) {
	setupTest()
	defer cleanupTest()

	lockKey := "test_concurrent_safe"
	counter := 0
	var wg sync.WaitGroup
	goroutineCount := 20

	startTime := time.Now()
	for i := 0; i < goroutineCount; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			lock := NewDistributedLock(lockKey, 10*time.Second)
			err := lock.Execute(func() error {
				temp := counter
				time.Sleep(5 * time.Millisecond)
				counter = temp + 1
				fmt.Printf("goroutine %d 安全执行, counter=%d\n", idx, counter)
				return nil
			})
			assert.NoError(t, err, "并发场景下获取锁执行不应出错")
		}(i)
	}

	wg.Wait()
	duration := time.Since(startTime)
	assert.Equal(t, goroutineCount, counter, "20个goroutine并发累加后counter应等于20")
	t.Logf("并发安全测试通过, 耗时=%v", duration)
}

func TestDistributedLock_WrongTokenCannotRelease(t *testing.T) {
	setupTest()
	defer cleanupTest()

	lockKey := "test_wrong_token"
	lock1 := NewDistributedLock(lockKey, 5*time.Second)
	lock2 := NewDistributedLock(lockKey, 5*time.Second)

	token1, err := lock1.Acquire()
	assert.NoError(t, err)
	assert.NotEmpty(t, token1)

	releasedWrong := lock2.Release("wrong_token_12345")
	assert.False(t, releasedWrong, "使用错误token释放锁应失败")

	releasedRight := lock1.Release(token1)
	assert.True(t, releasedRight, "使用正确token释放锁应成功")
}
