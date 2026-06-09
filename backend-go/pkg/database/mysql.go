package database

import (
	"fmt"
	"realtime-auction-backend/config"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/pkg/logger"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitMySQL(cfg *config.Config) error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		cfg.DB.Username,
		cfg.DB.Password,
		cfg.DB.Host,
		cfg.DB.Port,
		cfg.DB.Database,
	)

	logLevel := gormlogger.Info
	if cfg.NodeEnv == "production" {
		logLevel = gormlogger.Warn
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(logLevel),
	})
	if err != nil {
		return fmt.Errorf("MySQL连接失败: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("获取底层sql.DB失败: %w", err)
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)

	if err := db.AutoMigrate(
		&model.User{},
		&model.AuctionGoods{},
		&model.BidRecord{},
		&model.Order{},
	); err != nil {
		return fmt.Errorf("数据库自动迁移失败: %w", err)
	}

	DB = db
	logger.SugarLogger.Info("✅ MySQL数据库连接成功，表结构自动迁移完成")
	return nil
}
