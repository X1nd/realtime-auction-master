package service

import (
	"fmt"
	"realtime-auction-backend/config"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/internal/websocket"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"sync"
	"sync/atomic"
	"time"
)

type BidRequest struct {
	GoodsId  int64
	UserId   int64
	ResultCh chan *BidResult
}

type BidResult struct {
	StateData    *AuctionStateData
	PrevBidderId int64
	EndedByMax   int64
	BidSeq       int64
	NextPrice    float64
	Err          error
}

type auctionBidQueue struct {
	goodsId     int64
	bidCh       chan *BidRequest
	stopCh      chan struct{}
	stopped     atomic.Bool
	latestState atomic.Value // *AuctionStateData, updated by processLoop
}

type BidQueueManager struct {
	mu       sync.RWMutex
	queues   map[int64]*auctionBidQueue
	dbWriter *AsyncDBWriter
}

var globalBidQueueManager *BidQueueManager

const broadcastInterval = 100 * time.Millisecond

func InitBidQueueManager(dbWriter *AsyncDBWriter) *BidQueueManager {
	mgr := &BidQueueManager{
		queues:   make(map[int64]*auctionBidQueue),
		dbWriter: dbWriter,
	}
	globalBidQueueManager = mgr
	return mgr
}

func (m *BidQueueManager) getOrCreateQueue(goodsId int64) (*auctionBidQueue, error) {
	m.mu.RLock()
	q, ok := m.queues[goodsId]
	m.mu.RUnlock()
	if ok {
		return q, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if q, ok = m.queues[goodsId]; ok {
		return q, nil
	}

	var goods model.AuctionGoods
	if err := database.DB.First(&goods, goodsId).Error; err != nil {
		return nil, fmt.Errorf("auction not found")
	}

	q = &auctionBidQueue{
		goodsId: goodsId,
		bidCh:   make(chan *BidRequest, config.GlobalConfig.BidQueueBufferSize),
		stopCh:  make(chan struct{}),
	}
	m.queues[goodsId] = q
	go q.processLoop(m.dbWriter)
	go q.broadcastLoop()
	logger.SugarLogger.Infof("Bid queue created: goodsId=%d, buffer=%d", goodsId, config.GlobalConfig.BidQueueBufferSize)
	return q, nil
}

func (m *BidQueueManager) Enqueue(req *BidRequest) error {
	q, err := m.getOrCreateQueue(req.GoodsId)
	if err != nil {
		return err
	}
	if q.stopped.Load() {
		return fmt.Errorf("竞拍已结束")
	}
	select {
	case q.bidCh <- req:
		return nil
	default:
		return fmt.Errorf("出价队列已满，请稍后重试")
	}
}

func (m *BidQueueManager) StopQueue(goodsId int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if q, ok := m.queues[goodsId]; ok {
		q.stopped.Store(true)
	}
}

func (q *auctionBidQueue) processLoop(dbWriter *AsyncDBWriter) {
	stateKey := getAuctionStateKey(q.goodsId)

	for {
		select {
		case req := <-q.bidCh:
			evalResult, err := evalBidScript(stateKey, req.UserId)
			if err != nil {
				logger.SugarLogger.Errorf("EvalBidScript failed: goodsId=%d, userId=%d, err=%v",
					q.goodsId, req.UserId, err)
				if req.ResultCh != nil {
					req.ResultCh <- &BidResult{Err: fmt.Errorf("出价处理失败")}
				}
				continue
			}

			result := parseBidResult(evalResult)

			if result.Err != nil {
				if req.ResultCh != nil {
					req.ResultCh <- result
				}
				continue
			}

			// Reload full state from Redis to get static fields (incrementPrice etc.)
			if result.StateData != nil {
				if full, err := LoadStateFromRedis(stateKey); err == nil {
					full.CurrentPrice = result.StateData.CurrentPrice
					full.RemainingMs = result.StateData.RemainingMs
					full.ParticipantCount = result.StateData.ParticipantCount
					full.LatestBidderId = result.StateData.LatestBidderId
					result.StateData = full
				}
			}

			// Update latest state for broadcast goroutine
			if result.StateData != nil {
				q.latestState.Store(result.StateData)

				// Broadcast to room so all clients update rank list
				if result.StateData.LatestBidderId != nil {
					roomMsg := map[string]interface{}{
						"currentState":     string(result.StateData.CurrentState),
						"currentPrice":     result.StateData.CurrentPrice,
						"remainingMs":      result.StateData.RemainingMs,
						"participantCount": result.StateData.ParticipantCount,
						"latestBidderId":   *result.StateData.LatestBidderId,
						"maxPrice":         result.StateData.MaxPrice,
						"incrementPrice":   result.StateData.IncrementPrice,
						"autoDelaySeconds": result.StateData.AutoDelaySeconds,
						"delayCount":       result.StateData.DelayCount,
						"maxDelayCount":    result.StateData.MaxDelayCount,
					}
					websocket.GlobalServer.BroadcastToAuctionRoom(q.goodsId, "price-updated", roomMsg)
				}
			}

			// Async DB write
			dbWriter.Enqueue(&bidRecordTask{
				GoodsId:  q.goodsId,
				UserId:   req.UserId,
				BidPrice: result.NextPrice,
				BidSeq:   result.BidSeq,
				BidTime:  time.Now().UnixMilli(),
			})

			if req.ResultCh != nil {
				req.ResultCh <- result
			}

			// Handle auction end
			if result.EndedByMax > 0 || result.StateData.CurrentState == AuctionStateEnded {
				q.stopped.Store(true)
				EndAuction(q.goodsId, result.StateData)
			}

		case <-q.stopCh:
			return
		}
	}
}

// broadcastLoop sends price updates to all room members every 100ms
func (q *auctionBidQueue) broadcastLoop() {
	ticker := time.NewTicker(broadcastInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if q.stopped.Load() {
				return
			}
			state := q.latestState.Load()
			if state == nil {
				continue
			}
			sd := state.(*AuctionStateData)
			websocket.GlobalServer.BroadcastToAuctionRoom(q.goodsId, "price-sync", map[string]interface{}{
				"currentState":     string(sd.CurrentState),
				"currentPrice":     sd.CurrentPrice,
				"remainingMs":      sd.RemainingMs,
				"participantCount": sd.ParticipantCount,
				"latestBidderId":   sd.LatestBidderId,
				"incrementPrice":   sd.IncrementPrice,
				"autoDelaySeconds": sd.AutoDelaySeconds,
				"delayCount":       sd.DelayCount,
				"maxDelayCount":    sd.MaxDelayCount,
			})
		case <-q.stopCh:
			return
		}
	}
}

func (m *BidQueueManager) StartCleanup(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			m.mu.Lock()
			for id, q := range m.queues {
				if q.stopped.Load() {
					close(q.stopCh)
					delete(m.queues, id)
					logger.SugarLogger.Infof("Cleaned up bid queue: goodsId=%d", id)
				}
			}
			m.mu.Unlock()
		}
	}()
}
