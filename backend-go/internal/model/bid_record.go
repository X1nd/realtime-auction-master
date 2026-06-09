package model

import (
	"time"
)

type BidRecord struct {
	ID             int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	AuctionGoodsID int64     `gorm:"type:bigint;not null;column:auction_goods_id;uniqueIndex:uk_goods_seq,priority:1" json:"auctionGoodsId"`
	UserID         int64     `gorm:"type:bigint;not null;column:user_id" json:"userId"`
	BidPrice       float64   `gorm:"type:decimal(10,2);not null;column:bid_price" json:"bidPrice"`
	BidTime        time.Time `gorm:"type:datetime(3);not null;column:bid_time" json:"bidTime"`
	BidSeq         int64     `gorm:"type:bigint;not null;column:bid_seq;uniqueIndex:uk_goods_seq,priority:2" json:"bidSeq"`
}

func (BidRecord) TableName() string {
	return "bid_records"
}
