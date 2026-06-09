package model

import (
	"time"
)

type AuctionStatus int8

const (
	AuctionStatusNotStarted AuctionStatus = 0
	AuctionStatusOngoing    AuctionStatus = 1
	AuctionStatusEnded      AuctionStatus = 2
	AuctionStatusCancelled  AuctionStatus = 3
)

type AuctionGoods struct {
	ID               int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID           int64          `gorm:"type:bigint;not null;default:0;column:user_id;index" json:"userId"`
	Round            int            `gorm:"type:int;not null;default:1;column:round;index" json:"round"`
	Name             string         `gorm:"type:varchar(200);not null" json:"name"`
	Description      *string        `gorm:"type:text" json:"description"`
	ImageUrl         *string        `gorm:"type:varchar(500);column:image_url" json:"imageUrl"`
	Status           AuctionStatus  `gorm:"type:tinyint;not null;default:0" json:"status"`
	StartPrice       float64        `gorm:"type:decimal(10,2);not null;default:0.00;column:start_price" json:"startPrice"`
	IncrementPrice   float64        `gorm:"type:decimal(10,2);not null;default:10.00;column:increment_price" json:"incrementPrice"`
	MaxPrice         *float64       `gorm:"type:decimal(10,2);column:max_price" json:"maxPrice"`
	DurationSeconds  int            `gorm:"type:int;not null;default:300;column:duration_seconds" json:"durationSeconds"`
	AutoDelaySeconds int            `gorm:"type:int;not null;default:15;column:auto_delay_seconds" json:"autoDelaySeconds"`
	StartTime        *time.Time     `gorm:"column:start_time" json:"startTime"`
	EndTime          *time.Time     `gorm:"column:end_time" json:"endTime"`
	WinnerUserId     *int64         `gorm:"column:winner_user_id" json:"winnerUserId"`
	FinalPrice       *float64       `gorm:"type:decimal(10,2);column:final_price" json:"finalPrice"`
	SortOrder        int            `gorm:"type:int;not null;default:0;column:sort_order" json:"sortOrder"`
	CreatedAt        time.Time      `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt        time.Time      `gorm:"column:updated_at" json:"updatedAt"`
}

func (AuctionGoods) TableName() string {
	return "auction_goods"
}
