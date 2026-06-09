package service

import (
	"realtime-auction-backend/config"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"testing"

	"github.com/stretchr/testify/assert"
)

func setupFSMTest() {
	cfg := &config.Config{
		NodeEnv: "test",
		Redis: config.RedisConfig{
			Host:     "localhost",
			Port:     6379,
			Password: "",
			DB:       14,
		},
		RedisKeyPrefix: "test:auction:",
	}
	config.GlobalConfig = cfg
	logger.InitLogger(true)

	if database.RedisClient == nil {
		_ = database.InitRedis(cfg)
	}
}

func cleanupFSMTest(goodsId int64) {
	asm := NewAuctionStateMachine(goodsId)
	_ = asm.Clear()
}

func TestAuctionStateMachine_Initialize(t *testing.T) {
	setupFSMTest()
	goodsId := int64(1001)
	defer cleanupFSMTest(goodsId)

	asm := NewAuctionStateMachine(goodsId)
	err := asm.Initialize(
		0.0,
		10.0,
		nil,
		300,
		15,
	)
	assert.NoError(t, err, "状态机初始化不应出错")

	ok, err := asm.Load()
	assert.NoError(t, err)
	assert.True(t, ok, "加载状态机应成功")

	data := asm.GetStateData()
	assert.NotNil(t, data)
	assert.Equal(t, AuctionStateNotStarted, data.CurrentState)
	assert.Equal(t, 0.0, data.CurrentPrice)
	assert.Equal(t, int64(300000), data.RemainingMs)
	assert.Equal(t, 15, data.AutoDelaySeconds)
	t.Log("状态机初始化测试通过")
}

func TestAuctionStateMachine_NormalFlow(t *testing.T) {
	setupFSMTest()
	goodsId := int64(1002)
	defer cleanupFSMTest(goodsId)

	asm := NewAuctionStateMachine(goodsId)
	_ = asm.Initialize(0, 10, nil, 100, 15)

	_, _ = asm.Load()
	assert.Equal(t, AuctionStateNotStarted, asm.GetCurrentState())

	ok := asm.Transition(AuctionEventStart)
	assert.True(t, ok, "NOT_STARTED -> START 转移成功")
	assert.Equal(t, AuctionStateOngoing, asm.GetCurrentState())

	ok = asm.Transition(AuctionEventBid)
	assert.True(t, ok, "ONGOING -> BID 转移成功")

	_ = asm.UpdatePrice(10.0, 1)
	data := asm.GetStateData()
	assert.Equal(t, 10.0, data.CurrentPrice)
	assert.Equal(t, int64(1), *data.LatestBidderId)

	endOk := asm.Transition(AuctionEventTimeout)
	assert.True(t, endOk, "ONGOING -> TIMEOUT 结束成功")
	assert.Equal(t, AuctionStateEnded, asm.GetCurrentState())

	illegal := asm.Transition(AuctionEventBid)
	assert.False(t, illegal, "已结束状态下继续BID应失败")
	t.Log("正常竞拍流测试通过")
}

func TestAuctionStateMachine_BoundedDelay(t *testing.T) {
	setupFSMTest()
	goodsId := int64(1003)
	defer cleanupFSMTest(goodsId)

	asm := NewAuctionStateMachine(goodsId)
	_ = asm.Initialize(0, 10, nil, 100, 15)

	_, _ = asm.Load()

	// Verify delay defaults
	data := asm.GetStateData()
	assert.Equal(t, 0, data.DelayCount)
	assert.Equal(t, 3, data.MaxDelayCount)

	_ = asm.Transition(AuctionEventStart)
	assert.Equal(t, AuctionStateOngoing, asm.GetCurrentState())

	// Bid during ONGOING is allowed (Lua handles delay transition)
	ok := asm.Transition(AuctionEventBid)
	assert.True(t, ok, "ONGOING状态下出价应允许")

	// DELAYING state allows bids
	asm.data.CurrentState = AuctionStateDelaying
	ok = asm.Transition(AuctionEventBid)
	assert.True(t, ok, "DELAYING状态下出价应允许")

	// Timeout on DELAYING -> ENDED
	ok = asm.Transition(AuctionEventTimeout)
	assert.True(t, ok, "DELAYING超时应结束")
	assert.Equal(t, AuctionStateEnded, asm.GetCurrentState())

	t.Log("有界延时逻辑测试通过")
}

func TestAuctionStateMachine_CancelFlow(t *testing.T) {
	setupFSMTest()
	goodsId := int64(1004)
	defer cleanupFSMTest(goodsId)

	asm := NewAuctionStateMachine(goodsId)
	_ = asm.Initialize(0, 10, nil, 60, 15)
	_, _ = asm.Load()

	_ = asm.Transition(AuctionEventStart)
	ok := asm.Transition(AuctionEventCancel)
	assert.True(t, ok, "ONGOING状态下取消成功")
	assert.Equal(t, AuctionStateCancelled, asm.GetCurrentState())
	t.Log("异常取消流程测试通过")
}
