package service

import (
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"time"
)

type bidRecordTask struct {
	GoodsId  int64
	UserId   int64
	BidPrice float64
	BidSeq   int64
	BidTime  int64
}

type AsyncDBWriter struct {
	taskCh chan *bidRecordTask
	stopCh chan struct{}
}

func NewAsyncDBWriter(workerCount int, bufferSize int) *AsyncDBWriter {
	w := &AsyncDBWriter{
		taskCh: make(chan *bidRecordTask, bufferSize),
		stopCh: make(chan struct{}),
	}
	for i := 0; i < workerCount; i++ {
		go w.worker(i)
	}
	logger.SugarLogger.Infof("AsyncDBWriter started: workers=%d, buffer=%d", workerCount, bufferSize)
	return w
}

func (w *AsyncDBWriter) worker(id int) {
	for {
		select {
		case task := <-w.taskCh:
			record := model.BidRecord{
				AuctionGoodsID: task.GoodsId,
				UserID:         task.UserId,
				BidPrice:       task.BidPrice,
				BidTime:        time.UnixMilli(task.BidTime),
				BidSeq:         task.BidSeq,
			}
			if err := database.DB.Create(&record).Error; err != nil {
				logger.SugarLogger.Errorf("AsyncDBWriter[%d] insert failed: goodsId=%d, bidSeq=%d, err=%v",
					id, task.GoodsId, task.BidSeq, err)
			}
		case <-w.stopCh:
			return
		}
	}
}

func (w *AsyncDBWriter) Enqueue(task *bidRecordTask) {
	select {
	case w.taskCh <- task:
	default:
		logger.SugarLogger.Errorf("AsyncDBWriter channel full, dropping: goodsId=%d, bidSeq=%d",
			task.GoodsId, task.BidSeq)
	}
}

func (w *AsyncDBWriter) Shutdown() {
	close(w.stopCh)
}
