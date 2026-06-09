package handler

import (
	"net/http"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/internal/service"
	"realtime-auction-backend/internal/websocket"
	"realtime-auction-backend/pkg/database"
	"strconv"

	"github.com/gin-gonic/gin"
)

func PlaceBid(c *gin.Context) {
	userId := c.GetInt64("userId")

	var req struct {
		GoodsID int64 `json:"goodsId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
		return
	}

	stateData, err := service.ProcessBid(req.GoodsID, userId)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	if ws := websocket.GlobalServer; ws != nil {
		ws.BroadcastToAuctionRoom(req.GoodsID, "price-updated", map[string]interface{}{
			"currentState":     string(stateData.CurrentState),
			"currentPrice":     stateData.CurrentPrice,
			"remainingMs":      stateData.RemainingMs,
			"participantCount": stateData.ParticipantCount,
			"latestBidderId":   userId,
			"maxPrice":         stateData.MaxPrice,
			"incrementPrice":   stateData.IncrementPrice,
			"autoDelaySeconds": stateData.AutoDelaySeconds,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "出价成功",
		"data": gin.H{
			"currentPrice": stateData.CurrentPrice,
			"remainingMs":  stateData.RemainingMs,
		},
	})
}

func ListMyBids(c *gin.Context) {
	userId := c.GetInt64("userId")
	goodsIdStr := c.Query("goodsId")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	var total int64
	var bids []model.BidRecord

	query := database.DB.Model(&model.BidRecord{}).Where("user_id = ?", userId)
	if goodsIdStr != "" {
		if goodsId, err := strconv.ParseInt(goodsIdStr, 10, 64); err == nil {
			query = query.Where("auction_goods_id = ?", goodsId)
		}
	}
	query.Count(&total)
	query.Order("bid_time DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&bids)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":     bids,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}
