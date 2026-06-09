package handler

import (
	"fmt"
	"net/http"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/internal/service"
	"realtime-auction-backend/internal/websocket"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func requireGoodsOwnership(c *gin.Context, goods *model.AuctionGoods) bool {
	userId := c.GetInt64("userId")
	role, _ := c.Get("role")
	if role == "admin" {
		return true
	}
	if goods.UserID != userId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作此商品"})
		return false
	}
	return true
}

func ListAuctions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	var total int64
	var auctions []model.AuctionGoods

	userIdFilter := c.Query("userId")
	baseQuery := database.DB.Model(&model.AuctionGoods{})
	if userIdFilter != "" {
		if uid, err := strconv.ParseInt(userIdFilter, 10, 64); err == nil {
			baseQuery = baseQuery.Where("user_id = ?", uid)
		}
	}
	baseQuery.Count(&total)
	// Sort: ongoing items first (pulls their round to top), then by round.
	// Within each round: ongoing → not_started (by sort_order) → ended (by end_time)
	baseQuery.Order(`
		CASE WHEN status = 1 THEN 0 ELSE 1 END,
		round ASC,
		CASE WHEN status = 1 THEN 0 WHEN status = 0 THEN 1 ELSE 2 END,
		sort_order ASC,
		id ASC`).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&auctions)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":     auctions,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

func GetAuction(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的商品ID"})
		return
	}

	var goods model.AuctionGoods
	if err := database.DB.First(&goods, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "竞拍商品不存在"})
		return
	}

	// count participants
	var participantCount int64
	database.DB.Model(&model.BidRecord{}).
		Where("auction_goods_id = ?", id).
		Distinct("user_id").
		Count(&participantCount)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"goods":            goods,
			"participantCount": participantCount,
		},
	})
}

func CreateAuction(c *gin.Context) {
	var goods model.AuctionGoods
	if err := c.ShouldBindJSON(&goods); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}

	if goods.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "商品名称不能为空"})
		return
	}
	if goods.IncrementPrice <= 0 {
		goods.IncrementPrice = 10
	}
	if goods.DurationSeconds <= 0 {
		goods.DurationSeconds = 300
	}
	if goods.AutoDelaySeconds <= 0 {
		goods.AutoDelaySeconds = 15
	}
	goods.Status = model.AuctionStatusNotStarted
	goods.UserID = c.GetInt64("userId")

	// 默认场次为1
	if goods.Round == 0 {
		goods.Round = 1
	}
	// 自动分配排序号（未指定时排到末尾）
	if goods.SortOrder == 0 {
		var maxSort int
		database.DB.Model(&model.AuctionGoods{}).Select("COALESCE(MAX(sort_order), 0)").Scan(&maxSort)
		goods.SortOrder = maxSort + 1
	}

	if err := database.DB.Create(&goods).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": goods})
}

type BatchCreateRequest struct {
	Items []BatchAuctionItem `json:"items" binding:"required,min=1,max=100"`
}

type BatchAuctionItem struct {
	Name             string   `json:"name" binding:"required"`
	Description      *string  `json:"description"`
	ImageUrl         *string  `json:"imageUrl"`
	StartPrice       float64  `json:"startPrice"`
	IncrementPrice   float64  `json:"incrementPrice"`
	MaxPrice         *float64 `json:"maxPrice"`
	DurationSeconds  int      `json:"durationSeconds"`
	AutoDelaySeconds int      `json:"autoDelaySeconds"`
	SortOrder        int      `json:"sortOrder"`
	Round            int      `json:"round"`
}

func BatchCreateAuctions(c *gin.Context) {
	var req BatchCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}

	// Validate each item
	for i, item := range req.Items {
		if item.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": fmt.Sprintf("第 %d 条商品名称不能为空", i+1),
			})
			return
		}
		if item.IncrementPrice <= 0 {
			req.Items[i].IncrementPrice = 10
		}
		if item.DurationSeconds <= 0 {
			req.Items[i].DurationSeconds = 300
		}
		if item.AutoDelaySeconds <= 0 {
			req.Items[i].AutoDelaySeconds = 15
		}
	}

	// Query current max sort_order once
	var maxSort int
	database.DB.Model(&model.AuctionGoods{}).Select("COALESCE(MAX(sort_order), 0)").Scan(&maxSort)

	var created []model.AuctionGoods

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		for i, item := range req.Items {
			sortOrder := item.SortOrder
			if sortOrder == 0 {
				maxSort++
				sortOrder = maxSort
			}
			round := item.Round
			if round == 0 {
				round = 1
			}
			goods := model.AuctionGoods{
				UserID:           c.GetInt64("userId"),
				Name:             item.Name,
				Description:      item.Description,
				ImageUrl:         item.ImageUrl,
				StartPrice:       item.StartPrice,
				IncrementPrice:   item.IncrementPrice,
				MaxPrice:         item.MaxPrice,
				DurationSeconds:  item.DurationSeconds,
				AutoDelaySeconds: item.AutoDelaySeconds,
				Status:           model.AuctionStatusNotStarted,
				SortOrder:        sortOrder,
				Round:            round,
			}

			if err := tx.Create(&goods).Error; err != nil {
				return fmt.Errorf("第 %d 条创建失败: %w", i+1, err)
			}
			created = append(created, goods)
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": created})
}

func StartAuction(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的商品ID"})
		return
	}

	var goods model.AuctionGoods
	if err := database.DB.First(&goods, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "竞拍商品不存在"})
		return
	}

	if goods.Status != model.AuctionStatusNotStarted {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "只能启动未开始的竞拍"})
		return
	}

	if !requireGoodsOwnership(c, &goods) {
		return
	}

	// Prevent multiple ongoing auctions per merchant
	var existingOngoing model.AuctionGoods
	if err := database.DB.Where("user_id = ? AND status = ?", goods.UserID, model.AuctionStatusOngoing).
		First(&existingOngoing).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "该商家已有进行中的竞拍，请先结束当前竞拍"})
		return
	}

	now := time.Now()
	database.DB.Model(&goods).Updates(map[string]interface{}{
		"status":     model.AuctionStatusOngoing,
		"start_time": now,
	})

	// 初始化Redis状态机
	asm := service.NewAuctionStateMachine(id)
	var maxPrice *float64
	if goods.MaxPrice != nil {
		maxPrice = goods.MaxPrice
	}
	asm.Initialize(goods.StartPrice, goods.IncrementPrice, maxPrice, goods.DurationSeconds, goods.AutoDelaySeconds)
	asm.Transition(service.AuctionEventStart)

	// Start robot bidders for testing
	service.GlobalBotBidder.StartBidding(id)

	logger.AuditAuctionStart(id, goods.UserID, goods.Name)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "竞拍已开始",
		"data":    gin.H{"startTime": now},
	})
}

func CancelAuction(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的商品ID"})
		return
	}

	var goods model.AuctionGoods
	if err := database.DB.First(&goods, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "竞拍商品不存在"})
		return
	}

	if goods.Status != model.AuctionStatusOngoing {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "只能取消进行中的竞拍"})
		return
	}

	if !requireGoodsOwnership(c, &goods) {
		return
	}

	database.DB.Model(&goods).Update("status", model.AuctionStatusCancelled)

	// 清除 Redis 状态机
	asm := service.NewAuctionStateMachine(id)
	asm.Clear()

	logger.AuditAuctionCancelled(id, goods.UserID, goods.Name)

	// WebSocket 广播取消事件
	websocket.GlobalServer.BroadcastToAuctionRoom(id, "auction-ended", map[string]interface{}{
		"currentState": string(service.AuctionStateCancelled),
		"currentPrice": goods.StartPrice,
	})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "竞拍已取消"})
}

func UpdateAuction(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的商品ID"})
		return
	}

	var goods model.AuctionGoods
	if err := database.DB.First(&goods, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "竞拍商品不存在"})
		return
	}

	if goods.Status != model.AuctionStatusNotStarted {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "只能修改未开始的竞拍"})
		return
	}

	if !requireGoodsOwnership(c, &goods) {
		return
	}

	var req struct {
		Name             *string  `json:"name"`
		Description      *string  `json:"description"`
		ImageUrl         *string  `json:"imageUrl"`
		StartPrice       *float64 `json:"startPrice"`
		IncrementPrice   *float64 `json:"incrementPrice"`
		MaxPrice         *float64 `json:"maxPrice"`
		DurationSeconds  *int     `json:"durationSeconds"`
		AutoDelaySeconds *int     `json:"autoDelaySeconds"`
		SortOrder        *int     `json:"sortOrder"`
		Round            *int     `json:"round"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.ImageUrl != nil {
		updates["image_url"] = *req.ImageUrl
	}
	if req.StartPrice != nil {
		updates["start_price"] = *req.StartPrice
	}
	if req.IncrementPrice != nil {
		if *req.IncrementPrice <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "加价幅度必须大于0"})
			return
		}
		updates["increment_price"] = *req.IncrementPrice
	}
	if req.MaxPrice != nil {
		updates["max_price"] = *req.MaxPrice
	}
	if req.DurationSeconds != nil {
		if *req.DurationSeconds <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "时长必须大于0"})
			return
		}
		updates["duration_seconds"] = *req.DurationSeconds
	}
	if req.AutoDelaySeconds != nil {
		if *req.AutoDelaySeconds < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "延时秒数不能为负数"})
			return
		}
		updates["auto_delay_seconds"] = *req.AutoDelaySeconds
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if req.Round != nil {
		if *req.Round <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "场次必须大于0"})
			return
		}
		updates["round"] = *req.Round
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "没有需要更新的字段"})
		return
	}

	database.DB.Model(&goods).Updates(updates)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "竞拍信息已更新"})
}

type RoomInfo struct {
	UserID      int64   `json:"userId"`
	Username    string  `json:"username"`
	Nickname    string  `json:"nickname"`
	AvatarUrl   *string `json:"avatarUrl"`
	OngoingName string  `json:"ongoingName"`
	TotalGoods  int64   `json:"totalGoods"`
	HasLive     bool    `json:"hasLive"`
}

func ListMerchantRooms(c *gin.Context) {
	var userIds []int64
	database.DB.Model(&model.AuctionGoods{}).
		Distinct("user_id").
		Where("user_id > 0").
		Pluck("user_id", &userIds)

	rooms := make([]RoomInfo, 0, len(userIds))
	for _, uid := range userIds {
		var user model.User
		if database.DB.First(&user, uid).Error != nil {
			continue
		}
		var ongoing model.AuctionGoods
		database.DB.Where("user_id = ? AND status = ?", uid, model.AuctionStatusOngoing).First(&ongoing)
		var total int64
		database.DB.Model(&model.AuctionGoods{}).Where("user_id = ?", uid).Count(&total)

		displayName := user.Nickname
		if displayName == "" {
			displayName = user.Username
		}
		rooms = append(rooms, RoomInfo{
			UserID:      uid,
			Username:    user.Username,
			Nickname:    displayName,
			AvatarUrl:   user.AvatarUrl,
			OngoingName: ongoing.Name,
			TotalGoods:  total,
			HasLive:     ongoing.ID > 0,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": rooms})
}

func GetSequence(c *gin.Context) {
	userIdStr := c.Query("userId")

	var all []model.AuctionGoods
	query := database.DB.Order("sort_order ASC, id ASC")
	if userIdStr != "" {
		if userId, err := strconv.ParseInt(userIdStr, 10, 64); err == nil {
			query = query.Where("user_id = ?", userId)
		}
	}
	query.Find(&all)

	var ongoing *model.AuctionGoods
	upcoming := make([]model.AuctionGoods, 0)
	ended := make([]model.AuctionGoods, 0)

	for i := range all {
		switch all[i].Status {
		case model.AuctionStatusOngoing:
			ongoing = &all[i]
		case model.AuctionStatusNotStarted:
			upcoming = append(upcoming, all[i])
		case model.AuctionStatusEnded, model.AuctionStatusCancelled:
			ended = append(ended, all[i])
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"ongoing":  ongoing,
			"upcoming": upcoming,
			"ended":    ended,
		},
	})
}

type ReorderItem struct {
	ID        int `json:"id"`
	SortOrder int `json:"sortOrder"`
}

type ReorderRequest struct {
	Items []ReorderItem `json:"items"`
}

func ReorderAuctions(c *gin.Context) {
	var req ReorderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
		return
	}

	tx := database.DB.Begin()
	for _, item := range req.Items {
		if err := tx.Model(&model.AuctionGoods{}).Where("id = ?", item.ID).
			Update("sort_order", item.SortOrder).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "排序更新失败"})
			return
		}
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "排序已更新"})
}

func ClearAuctions(c *gin.Context) {
	result := database.DB.Where("status <> ?", model.AuctionStatusOngoing).Delete(&model.AuctionGoods{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "清理失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已清理 %d 件商品（进行中的竞拍已保留）", result.RowsAffected),
		"data":    gin.H{"deleted": result.RowsAffected},
	})
}
