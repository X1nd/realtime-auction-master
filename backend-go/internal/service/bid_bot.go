package service

import (
	"math/rand"
	"sync"
	"time"

	"realtime-auction-backend/pkg/logger"
)

type BotConfig struct {
	UserId   int64
	Username string
}

var Bots = []BotConfig{
	{UserId: 99901, Username: "竞价达人A"},
	{UserId: 99902, Username: "竞价达人B"},
	{UserId: 99903, Username: "竞价达人C"},
	{UserId: 99904, Username: "竞价达人D"},
}

type BotBidder struct {
	mu     sync.Mutex
	active map[int64]map[int64]chan struct{} // goodsId -> botUserId -> stopCh
}

var GlobalBotBidder = &BotBidder{
	active: make(map[int64]map[int64]chan struct{}),
}

func (b *BotBidder) StartBidding(goodsId int64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, exists := b.active[goodsId]; exists {
		return
	}

	stops := make(map[int64]chan struct{})
	for _, bot := range Bots {
		stop := make(chan struct{})
		stops[bot.UserId] = stop
		go b.runBot(goodsId, bot, stop)
	}
	b.active[goodsId] = stops
	logger.SugarLogger.Infof("Robot bidders started: goodsId=%d, count=%d", goodsId, len(Bots))
}

func (b *BotBidder) StopBidding(goodsId int64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	stops, exists := b.active[goodsId]
	if !exists {
		return
	}
	for _, stop := range stops {
		close(stop)
	}
	delete(b.active, goodsId)
	logger.SugarLogger.Infof("Robot bidders stopped: goodsId=%d", goodsId)
}

func (b *BotBidder) runBot(goodsId int64, bot BotConfig, stop chan struct{}) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + bot.UserId))

	// Stagger initial delay so bots don't all bid at once
	initialDelay := time.Duration(rng.Intn(5000) + 3000) * time.Millisecond
	select {
	case <-stop:
		return
	case <-time.After(initialDelay):
	}

	for {
		// Random interval between 5s and 10s
		interval := time.Duration(5000+rng.Intn(5000)) * time.Millisecond
		select {
		case <-stop:
			return
		case <-time.After(interval):
		}

		// Check auction state via Redis
		stateData := GetOrRecoverAuctionState(goodsId)
		if stateData == nil {
			return
		}

		// Stop competing in the last 10 seconds
		if stateData.RemainingMs <= 10000 {
			continue
		}

		// Only bid if auction is active
		if stateData.CurrentState != AuctionStateOngoing && stateData.CurrentState != AuctionStateDelaying {
			return
		}

		// Don't bid if bot is already the latest bidder
		if stateData.LatestBidderId != nil && *stateData.LatestBidderId == bot.UserId {
			continue
		}

		_, err := ProcessBid(goodsId, bot.UserId)
		if err != nil {
			logger.SugarLogger.Debugf("Bot bid failed: bot=%s, goodsId=%d, err=%v", bot.Username, goodsId, err)
		}
	}
}
