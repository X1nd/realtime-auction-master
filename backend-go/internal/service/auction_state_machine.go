package service

import (
	"context"
	"encoding/json"
	"strconv"
	"realtime-auction-backend/config"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"

	"github.com/go-redis/redis/v8"
)

type AuctionState string

const (
	AuctionStateNotStarted AuctionState = "NOT_STARTED"
	AuctionStateWarmingUp  AuctionState = "WARMING_UP"
	AuctionStateOngoing    AuctionState = "ONGOING"
	AuctionStateDelaying   AuctionState = "DELAYING"
	AuctionStateEnded      AuctionState = "ENDED"
	AuctionStateCancelled  AuctionState = "CANCELLED"
)

type AuctionEvent string

const (
	AuctionEventStart   AuctionEvent = "START"
	AuctionEventBid     AuctionEvent = "BID"
	AuctionEventTimeout AuctionEvent = "TIMEOUT"
	AuctionEventDelay   AuctionEvent = "DELAY"
	AuctionEventCancel  AuctionEvent = "CANCEL"
)

type AuctionStateData struct {
	CurrentState     AuctionState `json:"currentState"`
	CurrentPrice     float64      `json:"currentPrice"`
	RemainingMs      int64        `json:"remainingMs"`
	ParticipantCount int64        `json:"participantCount"`
	LatestBidderId   *int64       `json:"latestBidderId"`
	MaxPrice         *float64     `json:"maxPrice"`
	IncrementPrice   float64      `json:"incrementPrice"`
	AutoDelaySeconds int          `json:"autoDelaySeconds"`
	MaxDelayCount    int          `json:"maxDelayCount"`
	DelayCount       int          `json:"delayCount"`
	BidSeq           int64        `json:"bidSeq"`
}

type AuctionStateMachine struct {
	goodsId int64
	data    *AuctionStateData
	ctx     context.Context
}

func getAuctionStateKey(goodsId int64) string {
	return config.GlobalConfig.RedisKeyPrefix + "auction:state:" + strconv.FormatInt(goodsId, 10)
}

func NewAuctionStateMachine(goodsId int64) *AuctionStateMachine {
	return &AuctionStateMachine{
		goodsId: goodsId,
		ctx:     database.GetRedisContext(),
	}
}

func (asm *AuctionStateMachine) Initialize(
	startPrice float64,
	incrementPrice float64,
	maxPrice *float64,
	durationSeconds int,
	autoDelaySeconds int,
) error {
	asm.data = &AuctionStateData{
		CurrentState:     AuctionStateNotStarted,
		CurrentPrice:     startPrice,
		RemainingMs:      int64(durationSeconds) * 1000,
		ParticipantCount: 0,
		LatestBidderId:   nil,
		MaxPrice:         maxPrice,
		IncrementPrice:   incrementPrice,
		AutoDelaySeconds: autoDelaySeconds,
		MaxDelayCount:    3,
		DelayCount:       0,
	}
	return asm.persistToRedis()
}

func (asm *AuctionStateMachine) Load() (bool, error) {
	key := getAuctionStateKey(asm.goodsId)
	raw, err := database.RedisClient.Get(asm.ctx, key).Bytes()
	if err != nil {
		if err == redis.Nil {
			return false, nil
		}
		return false, err
	}
	if err := json.Unmarshal(raw, &asm.data); err != nil {
		return false, err
	}
	return true, nil
}

func (asm *AuctionStateMachine) persistToRedis() error {
	if asm.data == nil {
		return nil
	}
	key := getAuctionStateKey(asm.goodsId)
	dataBytes, _ := json.Marshal(asm.data)
	return database.RedisClient.Set(asm.ctx, key, dataBytes, 0).Err()
}

func (asm *AuctionStateMachine) GetCurrentState() AuctionState {
	if asm.data == nil {
		return ""
	}
	return asm.data.CurrentState
}

func (asm *AuctionStateMachine) GetStateData() *AuctionStateData {
	if asm.data == nil {
		return nil
	}
	copyData := *asm.data
	return &copyData
}

func (asm *AuctionStateMachine) Transition(event AuctionEvent) bool {
	if asm.data == nil {
		logger.SugarLogger.Errorf("状态机数据未加载, goodsId=%d", asm.goodsId)
		return false
	}

	current := asm.data.CurrentState
	nextState := current
	transitioned := true

	logger.SugarLogger.Debugf("状态转移尝试: 当前=%s, 事件=%s, goodsId=%d", current, event, asm.goodsId)

	switch current {
	case AuctionStateNotStarted:
		if event == AuctionEventStart {
			nextState = AuctionStateOngoing
		} else {
			transitioned = false
		}
	case AuctionStateWarmingUp:
		if event == AuctionEventStart {
			nextState = AuctionStateOngoing
		} else if event == AuctionEventCancel {
			nextState = AuctionStateCancelled
		} else {
			transitioned = false
		}
	case AuctionStateOngoing:
		if event == AuctionEventBid {
			// Lua script handles delay transition
		} else if event == AuctionEventTimeout {
			nextState = AuctionStateEnded
		} else if event == AuctionEventCancel {
			nextState = AuctionStateCancelled
		} else {
			transitioned = false
		}
	case AuctionStateDelaying:
		if event == AuctionEventBid {
			// Lua script resets timer on bid
		} else if event == AuctionEventTimeout {
			nextState = AuctionStateEnded
		} else if event == AuctionEventCancel {
			nextState = AuctionStateCancelled
		} else {
			transitioned = false
		}
	case AuctionStateEnded, AuctionStateCancelled:
		transitioned = false
	default:
		transitioned = false
	}

	if transitioned {
		asm.data.CurrentState = nextState
		_ = asm.persistToRedis()
		logger.SugarLogger.Infof("状态转移成功: %s -> %s, goodsId=%d", current, nextState, asm.goodsId)
	} else {
		logger.SugarLogger.Warnf("非法状态转移: 当前=%s, 事件=%s, goodsId=%d", current, event, asm.goodsId)
	}

	return transitioned
}

func (asm *AuctionStateMachine) UpdatePrice(newPrice float64, bidderId int64) error {
	if asm.data == nil {
		return nil
	}
	asm.data.CurrentPrice = newPrice
	asm.data.LatestBidderId = &bidderId
	asm.data.ParticipantCount++
	return asm.persistToRedis()
}

func (asm *AuctionStateMachine) TickTimer(deltaMs int64) bool {
	if asm.data == nil {
		return false
	}
	asm.data.RemainingMs = maxInt64(0, asm.data.RemainingMs-deltaMs)
	_ = asm.persistToRedis()

	if asm.data.RemainingMs <= 0 {
		asm.Transition(AuctionEventTimeout)
		return true
	}
	return false
}

func (asm *AuctionStateMachine) Clear() error {
	key := getAuctionStateKey(asm.goodsId)
	biddersKey := key + ":bidders"
	database.RedisClient.Del(asm.ctx, key)
	database.RedisClient.Del(asm.ctx, biddersKey)
	asm.data = nil
	logger.SugarLogger.Infof("清除竞拍状态机数据, goodsId=%d", asm.goodsId)
	return nil
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
