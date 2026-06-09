package logger

import (
	"os"
	"path/filepath"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var GlobalLogger *zap.Logger
var SugarLogger *zap.SugaredLogger

// LogConfig controls log output behavior.
type LogConfig struct {
	LogDir   string // empty = stdout only
	LogLevel string // "debug"/"info"/"warn"/"error", default "info"
}

var DefaultLogConfig = LogConfig{
	LogDir:   "",
	LogLevel: "info",
}

func InitLogger(cfg LogConfig) {
	level := parseLevel(cfg.LogLevel)

	encoder := zapcore.NewConsoleEncoder(zapcore.EncoderConfig{
		TimeKey:        "ts",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.CapitalColorLevelEncoder,
		EncodeTime:     zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05.000"),
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	})

	var cores []zapcore.Core

	// Console output
	cores = append(cores, zapcore.NewCore(encoder, zapcore.AddSync(os.Stdout), level))

	// File output with rotation (production)
	if cfg.LogDir != "" {
		if err := os.MkdirAll(cfg.LogDir, 0755); err == nil {
			fileEncoder := zapcore.NewConsoleEncoder(zapcore.EncoderConfig{
				TimeKey:        "ts",
				LevelKey:       "level",
				NameKey:        "logger",
				CallerKey:      "caller",
				MessageKey:     "msg",
				StacktraceKey:  "stacktrace",
				LineEnding:     zapcore.DefaultLineEnding,
				EncodeLevel:    zapcore.CapitalLevelEncoder,
				EncodeTime:     zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05.000"),
				EncodeDuration: zapcore.SecondsDurationEncoder,
				EncodeCaller:   zapcore.ShortCallerEncoder,
			})

			appLog := &lumberjack.Logger{
				Filename:   filepath.Join(cfg.LogDir, "app.log"),
				MaxSize:    100, // MB
				MaxBackups: 30,
				MaxAge:     7, // days
				Compress:   true,
			}
			errorLog := &lumberjack.Logger{
				Filename:   filepath.Join(cfg.LogDir, "error.log"),
				MaxSize:    100,
				MaxBackups: 30,
				MaxAge:     30,
				Compress:   true,
			}

			cores = append(cores,
				zapcore.NewCore(fileEncoder, zapcore.AddSync(appLog), level),
				zapcore.NewCore(fileEncoder, zapcore.AddSync(errorLog), zapcore.ErrorLevel),
			)
		}
	}

	core := zapcore.NewTee(cores...)
	GlobalLogger = zap.New(core, zap.AddCaller(), zap.AddCallerSkip(1))
	SugarLogger = GlobalLogger.Sugar()
}

func parseLevel(s string) zapcore.Level {
	switch s {
	case "debug":
		return zapcore.DebugLevel
	case "warn":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

func Sync() {
	if GlobalLogger != nil {
		_ = GlobalLogger.Sync()
	}
}
