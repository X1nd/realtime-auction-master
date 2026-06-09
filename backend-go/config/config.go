package config

import (
	"log"

	"github.com/spf13/viper"
)

type DBConfig struct {
	Host     string `mapstructure:"DB_HOST"`
	Port     int    `mapstructure:"DB_PORT"`
	Database string `mapstructure:"DB_NAME"`
	Username string `mapstructure:"DB_USER"`
	Password string `mapstructure:"DB_PASSWORD"`
}

type RedisConfig struct {
	Host     string `mapstructure:"REDIS_HOST"`
	Port     int    `mapstructure:"REDIS_PORT"`
	Password string `mapstructure:"REDIS_PASSWORD"`
	DB       int    `mapstructure:"REDIS_DB"`
}

type JWTConfig struct {
	Secret           string `mapstructure:"JWT_SECRET"`
	ExpiresIn        string `mapstructure:"JWT_EXPIRES_IN"`
	RefreshExpiresIn string `mapstructure:"JWT_REFRESH_EXPIRES_IN"`
}

type Config struct {
	NodeEnv    string `mapstructure:"NODE_ENV"`
	Port       int    `mapstructure:"PORT"`
	SocketPort int    `mapstructure:"SOCKET_PORT"`

	DB    DBConfig    `mapstructure:",squash"`
	Redis RedisConfig `mapstructure:",squash"`
	JWT   JWTConfig   `mapstructure:",squash"`

	RedisKeyPrefix string

	// Performance tuning
	BidQueueBufferSize int `mapstructure:"BID_QUEUE_BUFFER_SIZE"`
	RedisPoolSize      int `mapstructure:"REDIS_POOL_SIZE"`
	AsyncDBWorkerCount int `mapstructure:"ASYNC_DB_WORKER_COUNT"`
	AsyncDBBufferSize  int `mapstructure:"ASYNC_DB_BUFFER_SIZE"`

	// Logging
	LogDir   string `mapstructure:"LOG_DIR"`
	LogLevel string `mapstructure:"LOG_LEVEL"`

	// File upload
	UploadDir       string `mapstructure:"UPLOAD_DIR"`
	MaxUploadSizeMB int    `mapstructure:"MAX_UPLOAD_SIZE_MB"`
}

var GlobalConfig *Config

func LoadConfig() *Config {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")

	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		log.Println("警告: 未找到.env文件，使用环境变量")
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		log.Fatalf("配置解析失败: %v", err)
	}

	if cfg.Port == 0 {
		cfg.Port = 3000
	}
	if cfg.SocketPort == 0 {
		cfg.SocketPort = 3001
	}
	cfg.RedisKeyPrefix = "auction:master:"

	// JWT defaults
	if cfg.JWT.ExpiresIn == "" {
		cfg.JWT.ExpiresIn = "15m"
	}
	if cfg.JWT.RefreshExpiresIn == "" {
		cfg.JWT.RefreshExpiresIn = "168h"
	}

	// Performance defaults
	if cfg.BidQueueBufferSize == 0 {
		cfg.BidQueueBufferSize = 2048
	}
	if cfg.RedisPoolSize == 0 {
		cfg.RedisPoolSize = 100
	}
	if cfg.AsyncDBWorkerCount == 0 {
		cfg.AsyncDBWorkerCount = 4
	}
	if cfg.AsyncDBBufferSize == 0 {
		cfg.AsyncDBBufferSize = 4096
	}

	// Upload defaults
	if cfg.UploadDir == "" {
		cfg.UploadDir = "./uploads"
	}
	if cfg.MaxUploadSizeMB == 0 {
		cfg.MaxUploadSizeMB = 10
	}

	// Logging defaults
	if cfg.LogDir == "" && cfg.NodeEnv == "production" {
		cfg.LogDir = "./logs"
	}
	if cfg.LogLevel == "" {
		if cfg.NodeEnv == "production" {
			cfg.LogLevel = "info"
		} else {
			cfg.LogLevel = "debug"
		}
	}

	GlobalConfig = &cfg
	return &cfg
}
