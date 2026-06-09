import { create } from 'zustand'

export enum AuctionState {
  NOT_STARTED = 'NOT_STARTED',
  ONGOING = 'ONGOING',
  DELAYING = 'DELAYING',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED'
}

export interface AuctionStateData {
  currentState: AuctionState
  currentPrice: number
  remainingMs: number
  participantCount: number
  latestBidderId: number | null
  maxPrice: number | null
  incrementPrice: number
  autoDelaySeconds: number
  delayCount: number
  maxDelayCount: number
}

export interface BidderInfo {
  userId: number
  username: string
  avatarUrl?: string
  bidPrice: number
  bidTime: number
}

export interface AuctionResult {
  winnerUserId: number | null
  finalPrice: number | null
}

export interface AuctionSequenceItem {
  id: number
  name: string
  sortOrder: number
  startPrice: number
  status: number
}

interface AuctionStore {
  goodsId: number | null
  auctionData: AuctionStateData | null
  rankList: BidderInfo[]
  result: AuctionResult | null
  isConnected: boolean
  myUserId: number
  myUsername: string
  myNickname: string
  userNames: Record<number, string>
  isMyTurn: boolean
  sequenceList: AuctionSequenceItem[]
  upcomingItems: AuctionSequenceItem[]
  nextAuctionId: number | null
  nextAuctionStartsInMs: number | null
  isTransitioning: boolean
  orderId: number | null
  currentGoodsId: number | null
  merchantUserId: number | null
  roomSequence: AuctionSequenceItem[]

  setGoodsId: (id: number) => void
  setCurrentGoodsId: (id: number | null) => void
  setMerchantUserId: (uid: number | null) => void
  setRoomSequence: (items: AuctionSequenceItem[]) => void
  setAuctionData: (data: AuctionStateData) => void
  setRankList: (list: BidderInfo[]) => void
  addBidder: (bidder: BidderInfo) => void
  setResult: (result: AuctionResult | null) => void
  setConnected: (connected: boolean) => void
  setMyUserId: (uid: number) => void
  setMyUser: (uid: number, username: string, nickname?: string) => void
  addUserName: (uid: number, username: string) => void
  setMyTurn: (turn: boolean) => void
  updatePrice: (price: number, bidderId: number) => void
  setSequenceData: (ongoing: any, upcoming: AuctionSequenceItem[], ended: any[]) => void
  setNextAuction: (id: number | null, startsInMs: number | null) => void
  setIsTransitioning: (transitioning: boolean) => void
  setOrderId: (id: number | null) => void
  reset: () => void
}

export const useAuctionStore = create<AuctionStore>((set, get) => ({
  goodsId: null,
  auctionData: null,
  rankList: [],
  result: null,
  isConnected: false,
  myUserId: 1,
  myUsername: '',
  myNickname: '',
  userNames: {},
  isMyTurn: false,
  sequenceList: [],
  upcomingItems: [],
  nextAuctionId: null,
  nextAuctionStartsInMs: null,
  isTransitioning: false,
  orderId: null,
  currentGoodsId: null,
  merchantUserId: null,
  roomSequence: [],

  setGoodsId: (id) => set({ goodsId: id }),
  setCurrentGoodsId: (id) => set({ currentGoodsId: id }),
  setMerchantUserId: (uid) => set({ merchantUserId: uid }),
  setRoomSequence: (items) => set({ roomSequence: items }),
  setAuctionData: (data) => set({ auctionData: data }),
  setRankList: (list) => set({ rankList: list }),
  addBidder: (bidder) => {
    const { rankList } = get()
    const existing = rankList.findIndex(b => b.userId === bidder.userId)
    if (existing >= 0) {
      const updated = [...rankList]
      updated[existing] = bidder
      set({ rankList: updated })
    } else {
      set({ rankList: [...rankList, bidder] })
    }
  },
  setResult: (result) => set({ result }),
  setConnected: (connected) => set({ isConnected: connected }),
  setMyUserId: (uid) => set({ myUserId: uid }),
  setMyUser: (uid, username, nickname) => set(state => ({
    myUserId: uid,
    myUsername: username,
    myNickname: nickname || username,
    userNames: { ...state.userNames, [uid]: nickname || username },
  })),
  addUserName: (uid, username) => set(state => ({
    userNames: { ...state.userNames, [uid]: username },
  })),
  setMyTurn: (turn) => set({ isMyTurn: turn }),
  updatePrice: (price, bidderId) => {
    const { myUserId } = get()
    set((state) => ({
      auctionData: state.auctionData ? { ...state.auctionData, currentPrice: price, latestBidderId: bidderId } : null,
      isMyTurn: bidderId === myUserId
    }))
  },
  setSequenceData: (ongoing, upcoming, ended) => set({
    sequenceList: [...(ongoing ? [ongoing] : []), ...upcoming, ...ended],
    upcomingItems: upcoming,
  }),
  setNextAuction: (id, startsInMs) => set({
    nextAuctionId: id,
    nextAuctionStartsInMs: startsInMs,
  }),
  setIsTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
  setOrderId: (id) => set({ orderId: id }),
  reset: () => set({
    goodsId: null,
    auctionData: null,
    rankList: [],
    result: null,
    isMyTurn: false,
    orderId: null,
    currentGoodsId: null,
    merchantUserId: null,
    roomSequence: [],
  })
}))
