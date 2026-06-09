package model

import (
	"time"
)

type User struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Username     string    `gorm:"type:varchar(50);not null;unique" json:"username"`
	Nickname     string    `gorm:"type:varchar(100);not null;default:''" json:"nickname"`
	PasswordHash string    `gorm:"type:varchar(255);not null;column:password_hash" json:"-"`
	Role         string    `gorm:"type:varchar(20);not null;default:'user';index" json:"role"`
	AvatarUrl    *string   `gorm:"type:varchar(500);column:avatar_url" json:"avatarUrl"`
	Phone        *string   `gorm:"type:varchar(20)" json:"phone"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"createdAt"`
}

func (User) TableName() string {
	return "users"
}
