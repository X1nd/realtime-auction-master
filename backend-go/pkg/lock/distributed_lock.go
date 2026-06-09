package lock

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"time"
)

type DistributedLock struct {
	key           string
	lockTimeout   time.Duration
	retryDelay    time.Duration
	maxRetryTimes int
}

func NewDistributedLock(key string, lockTimeout time.Duration) *DistributedLock {
	if lockTimeout == 0 {
		lockTimeout = 30 * time.Second
	}
	return &DistributedLock{
		key:           "lock:" + key,
		lockTimeout:   lockTimeout,
		retryDelay:    100 * time.Millisecond,
		maxRetryTimes: 50,
	}
}

func generateToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (l *DistributedLock) Acquire() (string, error) {
	token := generateToken()
	ctx := database.GetRedisContext()

	for i := 0; i < l.maxRetryTimes; i++ {
		ok, err := database.RedisClient.SetNX(ctx, l.key, token, l.lockTimeout).Result()
		if err != nil {
			logger.SugarLogger.Errorf("获取分布式锁出错: key=%s, err=%v", l.key, err)
			return "", err
		}
		if ok {
			logger.SugarLogger.Debugf("获取分布式锁成功: key=%s, token=%s", l.key, token)
			return token, nil
		}
		time.Sleep(l.retryDelay)
	}

	logger.SugarLogger.Warnf("获取分布式锁超时: key=%s", l.key)
	return "", fmt.Errorf("获取锁超时")
}

func (l *DistributedLock) Release(token string) bool {
	ctx := database.GetRedisContext()

	script := `
	if redis.call('GET', KEYS[1]) == ARGV[1] then
		return redis.call('DEL', KEYS[1])
	else
		return 0
	end
	`

	result, err := database.RedisClient.Eval(ctx, script, []string{l.key}, token).Result()
	if err != nil {
		logger.SugarLogger.Errorf("释放分布式锁出错: key=%s, err=%v", l.key, err)
		return false
	}
	success, ok := result.(int64)
	return ok && success == 1
}

func (l *DistributedLock) Execute(fn func() error) error {
	token, err := l.Acquire()
	if err != nil {
		return err
	}
	defer l.Release(token)
	return fn()
}

func WithLock(lockKey string, fn func() error) error {
	lock := NewDistributedLock(lockKey, 30*time.Second)
	return lock.Execute(fn)
}
