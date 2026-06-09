package handler

import (
	"net/http"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/pkg/database"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func ListOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	var total int64
	var orders []model.Order

	database.DB.Model(&model.Order{}).Count(&total)
	database.DB.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&orders)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":     orders,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

func GetOrder(c *gin.Context) {
	orderId, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的订单ID"})
		return
	}

	var order model.Order
	if err := database.DB.First(&order, orderId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "订单不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": order})
}

func PayOrder(c *gin.Context) {
	userId := c.GetInt64("userId")
	orderId, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的订单ID"})
		return
	}

	var order model.Order
	if err := database.DB.First(&order, orderId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "订单不存在"})
		return
	}

	if order.UserID != userId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作此订单"})
		return
	}

	if order.Status != model.OrderStatusPendingPayment {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "订单状态不允许支付"})
		return
	}

	now := time.Now()
	database.DB.Model(&order).Updates(map[string]interface{}{
		"status":   model.OrderStatusPaid,
		"pay_time": now,
	})

	order.Status = model.OrderStatusPaid
	order.PayTime = &now

	c.JSON(http.StatusOK, gin.H{"success": true, "data": order, "message": "支付成功"})
}

func ListMyOrders(c *gin.Context) {
	userId := c.GetInt64("userId")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 50 {
		pageSize = 10
	}

	var total int64
	var orders []model.Order

	query := database.DB.Model(&model.Order{}).Where("user_id = ?", userId)
	query.Count(&total)
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&orders)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":     orders,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
	})
}

func GetDashboardStats(c *gin.Context) {
	var totalGoods, ongoingCount, totalOrders int64

	userIdFilter := c.Query("userId")

	goodsQuery := database.DB.Model(&model.AuctionGoods{})
	ordersQuery := database.DB.Model(&model.Order{})
	if userIdFilter != "" {
		if uid, err := strconv.ParseInt(userIdFilter, 10, 64); err == nil {
			goodsQuery = goodsQuery.Where("user_id = ?", uid)
			ordersQuery = ordersQuery.Where("user_id = ?", uid)
		}
	}

	goodsQuery.Count(&totalGoods)
	goodsQuery.Where("status = ?", model.AuctionStatusOngoing).Count(&ongoingCount)
	ordersQuery.Count(&totalOrders)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"totalGoods":    totalGoods,
			"ongoingCount":  ongoingCount,
			"totalOrders":   totalOrders,
		},
	})
}
