package service

import (
	"fmt"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/internal/websocket"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
)

// GetOrRecoverAuctionState returns cached auction state or recovers from DB/Redis
func GetOrRecoverAuctionState(goodsId int64) *AuctionStateData {
	asm := NewAuctionStateMachine(goodsId)
	loaded, err := asm.Load()
	if err != nil || !loaded {
		var goods model.AuctionGoods
		if database.DB.First(&goods, goodsId).Error != nil {
			return nil
		}
		asm.Initialize(goods.StartPrice, goods.IncrementPrice, goods.MaxPrice, goods.DurationSeconds, goods.AutoDelaySeconds)
		if goods.Status == model.AuctionStatusOngoing {
			asm.Transition(AuctionEventStart)
		}
	}
	return asm.GetStateData()
}

func ProcessBid(goodsId int64, userId int64) (*AuctionStateData, error) {
	if globalBidQueueManager == nil {
		return nil, fmt.Errorf("出价系统未初始化")
	}

	resultCh := make(chan *BidResult, 1)
	req := &BidRequest{
		GoodsId:  goodsId,
		UserId:   userId,
		ResultCh: resultCh,
	}

	if err := globalBidQueueManager.Enqueue(req); err != nil {
		return nil, err
	}

	result := <-resultCh
	if result.Err != nil {
		logger.SugarLogger.Errorf("Bid rejected: goodsId=%d, userId=%d, err=%v", goodsId, userId, result.Err)
		return nil, result.Err
	}

	// Outbid notification (outside critical section)
	if result.PrevBidderId > 0 && result.PrevBidderId != userId && result.StateData != nil {
		websocket.GlobalServer.SendToUser(result.PrevBidderId, "outbid", map[string]interface{}{
			"goodsId":        goodsId,
			"currentPrice":   result.NextPrice,
			"latestBidderId": userId,
		})
		logger.SugarLogger.Infof("User %d outbid by user %d: goodsId=%d, price=%.2f",
			result.PrevBidderId, userId, goodsId, result.NextPrice)
	}

	return result.StateData, nil
}
