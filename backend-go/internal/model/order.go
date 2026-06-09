package model

import (
	"time"
)

type OrderStatus int8

const (
	OrderStatusPendingPayment OrderStatus = 0
	OrderStatusPaid           OrderStatus = 1
	OrderStatusCancelled      OrderStatus = 2
)

type Order struct {
	ID             int64         `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderNo        string        `gorm:"type:varchar(64);not null;unique;column:order_no" json:"orderNo"`
	AuctionGoodsID int64         `gorm:"type:bigint;not null;column:auction_goods_id" json:"auctionGoodsId"`
	UserID         int64         `gorm:"type:bigint;not null;column:user_id" json:"userId"`
	TotalAmount    float64       `gorm:"type:decimal(10,2);not null;column:total_amount" json:"totalAmount"`
	Status         OrderStatus   `gorm:"type:tinyint;not null;default:0" json:"status"`
	PayTime        *time.Time    `gorm:"column:pay_time" json:"payTime"`
	CreatedAt      time.Time      `gorm:"column:created_at" json:"createdAt"`
}

func (Order) TableName() string {
	return "orders"
}
