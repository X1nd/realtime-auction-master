package service

import (
	"encoding/json"
	"fmt"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"strconv"
	"sync"
)

var (
	bidScriptSHA   string
	timerScriptSHA string
	scriptOnce     sync.Once
)

const processBidScript = `
	local key = KEYS[1]
	local userId = tonumber(ARGV[1])

	local raw = redis.call('GET', key)
	if not raw then
	    return {0, 'AUCTION_NOT_FOUND', '', 0, 0, 0, 0, 0, 0}
	end

	local data = cjson.decode(raw)

	-- Validate state
	local state = data.currentState
	if state ~= 'ONGOING' and state ~= 'DELAYING' then
	    return {0, 'STATE_NOT_ALLOWED', state, data.currentPrice or 0, data.remainingMs or 0,
	            data.participantCount or 0, data.latestBidderId or 0, 0, data.incrementPrice or 0, data.autoDelaySeconds or 0}
	end

	-- Self-bid prevention
	local latestBidder = tonumber(data.latestBidderId) or 0
	if latestBidder == userId then
	    return {0, 'SELF_OUTBID', state, data.currentPrice or 0, data.remainingMs or 0,
	            data.participantCount or 0, latestBidder, 0, data.incrementPrice or 0, data.autoDelaySeconds or 0}
	end

	-- Calculate next price
	local currentPrice = tonumber(data.currentPrice) or 0
	local incrementPrice = tonumber(data.incrementPrice) or 0
	local nextPrice = currentPrice + incrementPrice

	-- Max price check
	local maxPrice = tonumber(data.maxPrice) or 0
	local endedByMaxPrice = 0
	local newState = state
	if maxPrice > 0 and nextPrice >= maxPrice then
	    endedByMaxPrice = 1
	    newState = 'ENDED'
	    nextPrice = maxPrice
	end

	-- Track unique bidders via Redis Set
	local biddersKey = key .. ':bidders'
	local isNewBidder = redis.call('SADD', biddersKey, userId)
	local participantCount = tonumber(data.participantCount) or 0
	if isNewBidder == 1 then
	    participantCount = participantCount + 1
	end

	-- Bounded auto-delay: reset timer on late bid, up to maxDelayCount times
	local remainingMs = tonumber(data.remainingMs) or 0
	local autoDelaySec = tonumber(data.autoDelaySeconds) or 15
	local delayCount = tonumber(data.delayCount) or 0
	local maxDelayCount = tonumber(data.maxDelayCount) or 3

	if state == 'ONGOING' and remainingMs <= autoDelaySec * 1000 then
	    if delayCount < maxDelayCount then
	        newState = 'DELAYING'
	        remainingMs = autoDelaySec * 1000
	        delayCount = delayCount + 1
	    end
	    -- else: time is low, delay limit exhausted, let timer expire naturally
	elseif state == 'DELAYING' then
	    remainingMs = autoDelaySec * 1000
	end

	-- Update data
	local prevBidderId = latestBidder
	data.currentState = newState
	data.currentPrice = nextPrice
	data.remainingMs = remainingMs
	data.participantCount = participantCount
	data.latestBidderId = userId
	data.bidSeq = (tonumber(data.bidSeq) or 0) + 1
	data.delayCount = delayCount

	redis.call('SET', key, cjson.encode(data))

	return {1, prevBidderId, newState, nextPrice, remainingMs,
	        data.participantCount, userId, data.bidSeq, endedByMaxPrice}
	`

const processTimerScript = `
	local key = KEYS[1]
	local deltaMs = tonumber(ARGV[1])

	local raw = redis.call('GET', key)
	if not raw then
	    return {0, '', 0}
	end

	local data = cjson.decode(raw)
	local state = data.currentState

	if state ~= 'ONGOING' and state ~= 'DELAYING' then
	    return {0, state, data.remainingMs or 0}
	end

	local remaining = (tonumber(data.remainingMs) or 0) - deltaMs
	if remaining <= 0 then
	    data.currentState = 'ENDED'
	    data.remainingMs = 0
	    redis.call('SET', key, cjson.encode(data))
	    return {2, 'ENDED', 0}
	end

	data.remainingMs = remaining
	redis.call('SET', key, cjson.encode(data))
	return {1, state, remaining}
	`

func LoadScripts() error {
	var loadErr error
	scriptOnce.Do(func() {
		ctx := database.GetRedisContext()
		sha, err := database.RedisClient.ScriptLoad(ctx, processBidScript).Result()
		if err != nil {
			loadErr = fmt.Errorf("SCRIPT LOAD bid script failed: %w", err)
			return
		}
		bidScriptSHA = sha
		logger.SugarLogger.Infof("Bid Lua script loaded: SHA=%s", sha)

		sha, err = database.RedisClient.ScriptLoad(ctx, processTimerScript).Result()
		if err != nil {
			loadErr = fmt.Errorf("SCRIPT LOAD timer script failed: %w", err)
			return
		}
		timerScriptSHA = sha
		logger.SugarLogger.Infof("Timer Lua script loaded: SHA=%s", sha)
	})
	return loadErr
}

func isNoScriptError(err error) bool {
	return err != nil && (len(err.Error()) > 0 &&
		(err.Error()[0:5] == "NOSCR" || err.Error()[0:5] == "noscr"))
}

func evalBidScript(key string, userId int64) ([]interface{}, error) {
	ctx := database.GetRedisContext()
	result, err := database.RedisClient.EvalSha(ctx, bidScriptSHA, []string{key}, userId).Result()
	if err != nil && isNoScriptError(err) {
		logger.SugarLogger.Warn("Bid script SHA not found, reloading...")
		sha, loadErr := database.RedisClient.ScriptLoad(ctx, processBidScript).Result()
		if loadErr != nil {
			return nil, loadErr
		}
		bidScriptSHA = sha
		result, err = database.RedisClient.EvalSha(ctx, bidScriptSHA, []string{key}, userId).Result()
	}
	if err != nil {
		return nil, err
	}
	return result.([]interface{}), nil
}

func evalTimerScript(key string, deltaMs int64) ([]interface{}, error) {
	ctx := database.GetRedisContext()
	result, err := database.RedisClient.EvalSha(ctx, timerScriptSHA, []string{key}, deltaMs).Result()
	if err != nil && isNoScriptError(err) {
		logger.SugarLogger.Warn("Timer script SHA not found, reloading...")
		sha, loadErr := database.RedisClient.ScriptLoad(ctx, processTimerScript).Result()
		if loadErr != nil {
			return nil, loadErr
		}
		timerScriptSHA = sha
		result, err = database.RedisClient.EvalSha(ctx, timerScriptSHA, []string{key}, deltaMs).Result()
	}
	if err != nil {
		return nil, err
	}
	return result.([]interface{}), nil
}

// Parse bid script return value into a BidResult
func parseBidResult(evalResult []interface{}) *BidResult {
	if len(evalResult) < 9 {
		return &BidResult{Err: fmt.Errorf("invalid Lua script return")}
	}

	success, _ := evalResult[0].(int64)

	var result BidResult
	if success == 0 {
		errMsg, _ := evalResult[1].(string)
		result.Err = fmt.Errorf("%s", errMsg)
		return &result
	}

	result.PrevBidderId, _ = evalResult[1].(int64)
	newState, _ := evalResult[2].(string)
	result.NextPrice = toFloat64(evalResult[3])
	result.StateData = &AuctionStateData{
		CurrentState: AuctionState(newState),
		CurrentPrice: result.NextPrice,
	}
	result.StateData.RemainingMs, _ = evalResult[4].(int64)
	result.StateData.ParticipantCount, _ = evalResult[5].(int64)
	result.StateData.LatestBidderId = intPtr(evalResult[6])
	result.BidSeq, _ = evalResult[7].(int64)
	result.EndedByMax, _ = evalResult[8].(int64)

	return &result
}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case int64:
		return float64(val)
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}
	return 0
}

// LoadStateFromRedis loads the auction state JSON from Redis and unmarshals it
func LoadStateFromRedis(key string) (*AuctionStateData, error) {
	raw, err := database.RedisClient.Get(database.GetRedisContext(), key).Bytes()
	if err != nil {
		return nil, err
	}
	var data AuctionStateData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	return &data, nil
}

func intPtr(v interface{}) *int64 {
	switch val := v.(type) {
	case int64:
		if val == 0 {
			return nil
		}
		return &val
	case float64:
		if val == 0 {
			return nil
		}
		i := int64(val)
		return &i
	}
	return nil
}
