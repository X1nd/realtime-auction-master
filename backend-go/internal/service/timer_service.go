package service

import (
	"fmt"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/internal/websocket"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"time"
)

func RunAuctionTimerLoop() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		var activeAuctions []model.AuctionGoods
		database.DB.Where("status = ?", model.AuctionStatusOngoing).Find(&activeAuctions)

		for _, goods := range activeAuctions {
			stateKey := getAuctionStateKey(goods.ID)
			evalResult, err := evalTimerScript(stateKey, 2000)
			if err != nil {
				logger.SugarLogger.Errorf("Timer eval failed: goodsId=%d, err=%v", goods.ID, err)
				continue
			}

			if len(evalResult) < 3 {
				continue
			}

			status, _ := evalResult[0].(int64)
			state, _ := evalResult[1].(string)
			remaining, _ := evalResult[2].(int64)

			if status == 2 {
				// Timer ended
				stateData, err := LoadStateFromRedis(stateKey)
				if err != nil || stateData == nil {
					logger.SugarLogger.Errorf("Failed to load state after timer end: goodsId=%d, err=%v", goods.ID, err)
					continue
				}
				stateData.CurrentState = AuctionStateEnded
				EndAuction(goods.ID, stateData)
				globalBidQueueManager.StopQueue(goods.ID)
			} else if status == 1 {
				websocket.GlobalServer.BroadcastToAuctionRoom(goods.ID, "timer-sync", map[string]interface{}{
					"remainingMs":  remaining,
					"currentState": state,
				})
			}
		}
	}
}

func EndAuction(goodsId int64, stateData *AuctionStateData) {
	// Stop robot bidders
	GlobalBotBidder.StopBidding(goodsId)

	logger.AuditAuctionEnd(goodsId, stateData.LatestBidderId, stateData.CurrentPrice)

	now := time.Now()
	var finalPrice *float64
	var winnerUserId *int64
	var orderId int64

	if stateData.LatestBidderId != nil {
		price := stateData.CurrentPrice
		finalPrice = &price
		winnerUserId = stateData.LatestBidderId

		// 生成订单
		orderNo := fmt.Sprintf("AUC%s%04d", now.Format("20060102150405"), goodsId%10000)
		order := model.Order{
			OrderNo:        orderNo,
			AuctionGoodsID: goodsId,
			UserID:         *stateData.LatestBidderId,
			TotalAmount:    stateData.CurrentPrice,
			Status:         model.OrderStatusPendingPayment,
		}
		if err := database.DB.Create(&order).Error; err != nil {
			logger.SugarLogger.Errorf("创建订单失败: %v", err)
		} else {
			orderId = order.ID
			logger.AuditOrderCreated(orderNo, *stateData.LatestBidderId, goodsId, stateData.CurrentPrice)
		}
	}

	database.DB.Model(&model.AuctionGoods{}).Where("id = ?", goodsId).Updates(map[string]interface{}{
		"status":         model.AuctionStatusEnded,
		"end_time":       now,
		"winner_user_id": winnerUserId,
		"final_price":    finalPrice,
	})

	// 清除 Redis 状态机
	asm := NewAuctionStateMachine(goodsId)
	asm.Clear()

	// 构建 orderId 值（指针，无中标者时为 nil）
	var orderIdPtr *int64
	if orderId > 0 {
		orderIdPtr = &orderId
	}

	// WebSocket 广播拍卖结束
	websocket.GlobalServer.BroadcastToAuctionRoom(goodsId, "auction-ended", map[string]interface{}{
		"currentState":     string(AuctionStateEnded),
		"currentPrice":     stateData.CurrentPrice,
		"winnerUserId":     winnerUserId,
		"finalPrice":       finalPrice,
		"orderId":          orderIdPtr,
		"participantCount": stateData.ParticipantCount,
	})

	// 读取已结束商品的 userId，限定同一商家内查找下一个
	var endedGoods model.AuctionGoods
	database.DB.First(&endedGoods, goodsId)

	// 查找同一商家内下一个待开始的拍卖
	var nextGoods model.AuctionGoods
	err := database.DB.Where("status = ? AND user_id = ?", model.AuctionStatusNotStarted, endedGoods.UserID).
		Order("sort_order ASC").
		First(&nextGoods).Error
	if err != nil {
		logger.SugarLogger.Infof("没有待开始的竞拍，序列结束: goodsId=%d, userId=%d", goodsId, endedGoods.UserID)
		return
	}

	logger.SugarLogger.Infof("下一个竞拍将在10秒后自动开始: goodsId=%d, name=%s", nextGoods.ID, nextGoods.Name)
	nextGoodsId := nextGoods.ID
	nextGoodsName := nextGoods.Name

	// 向同一商家直播间广播 "next-auction" 事件
	websocket.GlobalServer.BroadcastToAuctionRoom(goodsId, "next-auction", map[string]interface{}{
		"nextGoodsId":   nextGoods.ID,
		"nextGoodsName": nextGoods.Name,
		"startsInMs":    10000,
		"startPrice":    nextGoods.StartPrice,
	})

	// 10 秒后自动启动下一场
	time.AfterFunc(10*time.Second, func() {
		var checkGoods model.AuctionGoods
		if err := database.DB.First(&checkGoods, nextGoodsId).Error; err != nil {
			return
		}
		if checkGoods.Status != model.AuctionStatusNotStarted {
			logger.SugarLogger.Warnf("竞拍状态已变更，取消自动开始: goodsId=%d, status=%d",
				nextGoodsId, checkGoods.Status)
			return
		}

		now := time.Now()
		database.DB.Model(&model.AuctionGoods{}).Where("id = ?", nextGoodsId).Updates(map[string]interface{}{
			"status":     model.AuctionStatusOngoing,
			"start_time": now,
		})

		asm := NewAuctionStateMachine(nextGoodsId)
		asm.Initialize(checkGoods.StartPrice, checkGoods.IncrementPrice,
			checkGoods.MaxPrice, checkGoods.DurationSeconds, checkGoods.AutoDelaySeconds)
		asm.Transition(AuctionEventStart)

		// Start robot bidders for testing
		GlobalBotBidder.StartBidding(nextGoodsId)

		// 向同一商家直播间广播拍卖已开始
		websocket.GlobalServer.BroadcastToAuctionRoom(nextGoodsId, "auction-started", map[string]interface{}{
			"goodsId": nextGoodsId,
			"name":    nextGoodsName,
		})

		logger.SugarLogger.Infof("自动开始竞拍: goodsId=%d, name=%s", nextGoodsId, nextGoodsName)
	})
}

