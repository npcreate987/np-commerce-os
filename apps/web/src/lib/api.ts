import type {
  AddToCartInput,
  AffiliateAttribution,
  ApplyCouponInput,
  ApplyCreatorInput,
  ApplyRiderInput,
  AssignMenuItemInput,
  AuthResponse,
  Broadcast,
  BuyAgainItem,
  Campaign,
  CampaignKind,
  CampaignProduct,
  CampaignProductView,
  CreatorMatch,
  Cart,
  Carrier,
  ClaimReferralInput,
  Coupon,
  CouponQuote,
  CreateBroadcastInput,
  CreateCampaignInput,
  CreateCheckoutInput,
  CreateCouponInput,
  CreateDisputeInput,
  CreateLinkInput,
  CreateMenuCategoryInput,
  CreatePaymentInput,
  CreateProductInput,
  CreateShopInput,
  CreateTimeSlotInput,
  CreateVideoInput,
  CreatorLink,
  CreatorProfile,
  CreatorStats,
  DeliveryJob,
  Dispute,
  DisputeMessage,
  InAppMessage,
  InsightAnomaly,
  JoinCampaignInput,
  LinkResolve,
  LocalStore,
  LogisticsIssue,
  LoginInput,
  LoyaltyAccount,
  LoyaltyEntry,
  MenuCategory,
  MenuGroup,
  Order,
  OrderRisk,
  Payment,
  PriceSuggestion,
  Product,
  ProductRecommendation,
  RedeemLoyaltyInput,
  Referral,
  ReferralClaim,
  ReplyDisputeInput,
  ResolveDisputeInput,
  Rider,
  RiderLocationInput,
  AdminReplyChatInput,
  ChatConversation,
  ChatMessage,
  ChatbotConfig,
  ConsentState,
  CreateReviewInput,
  ConfirmUploadInput,
  EventFirehoseStats,
  HidePhotoInput,
  SendChatMessageInput,
  SendChatMessageResult,
  UpdateConsentInput,
  UserEvent,
  TasteProfileSummary,
  RecommendationBreakdown,
  FeedRail,
  ProactiveBar,
  LineLink,
  LinkLineInput,
  NotificationConfig,
  NotificationPref,
  PresignUploadInput,
  PresignUploadResult,
  PushSubscription,
  RegisterDeviceInput,
  ReviewPhoto,
  StorageConfig,
  SubscribePushInput,
  UpdateNotificationPrefInput,
  UserDevice,
  ProductSearchInput,
  ProductSearchResult,
  ShopSearchHit,
  Suggestion,
  TrackSearchInput,
  TrendingQuery,
  DemandForecastPoint,
  HideReviewInput,
  ModerationReview,
  ModelRunRecent,
  ModelRunSummary,
  PendingReviewItem,
  RatingSummary,
  Review,
  ReviewListItem,
  SalesTrendPoint,
  SegmentSummary,
  Shipment,
  ShipOrderInput,
  ShippingQuote,
  ShippingQuoteRequest,
  Shop,
  ShopInsightsOverview,
  ShopRisk,
  SignupInput,
  TimeSlot,
  TopProduct,
  UpsertLocalStoreInput,
  User,
  AdminVideoRow,
  ModerateVideoInput,
  ReportVideoInput,
  VideoFeedItem,
  VideoPost,
  VideoReportRow,
  VideoStatus,
  Wallet,
  WalletEntry,
} from '@np/types';
import { env } from './env';

interface ApiOptions {
  token?: string | null;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, opts: ApiOptions = {}): Promise<T> {
  const url = new URL(env.apiPrefix + path, env.apiUrl);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  // Only declare `Content-Type: application/json` when we actually send a
  // body — Fastify rejects empty bodies with FST_ERR_CTP_EMPTY_JSON_BODY
  // when the header is present (e.g. `POST /feed/:id/view`, `PATCH /admin/.../take-over`).
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  const payload: unknown = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : res.statusText;
    throw new ApiError(res.status, payload, message);
  }

  return payload as T;
}

export const api = {
  health: () => request<{ status: string }>('GET', '/health'),

  // Phase 16 — Native app version gate
  app: {
    version: (q?: { platform?: string; version?: string; build?: string }) =>
      request<{
        latest: string;
        minSupported: string;
        ios: { storeUrl: string };
        android: { storeUrl: string };
        message: { th: string; en: string };
        current: { platform: string; version: string; build: string } | null;
        status: 'OK' | 'UPDATE_AVAILABLE' | 'UPDATE_REQUIRED' | 'UNKNOWN';
      }>('GET', '/app/version', { query: q }),
  },

  // Phase 17 — Account deletion (Store-compliance requirement)
  account: {
    deletionStatus: (token: string) =>
      request<{
        pending: boolean;
        requestedAt: string | null;
        purgeAt: string | null;
        graceDays: number;
      }>('GET', '/me/account/deletion', { token }),
    requestDeletion: (token: string, reason?: string) =>
      request<{ purgeAt: string; graceDays: number }>(
        'DELETE',
        '/me/account',
        { token, body: { reason } },
      ),
    cancelDeletion: (token: string) =>
      request<{ cancelled: boolean }>(
        'POST',
        '/me/account/deletion/cancel',
        { token, body: {} },
      ),
  },

  auth: {
    signup: (input: SignupInput) => request<AuthResponse>('POST', '/auth/signup', { body: input }),
    login: (input: LoginInput) => request<AuthResponse>('POST', '/auth/login', { body: input }),
    // Phase 21 — LINE Login. Frontend passes the id_token from LIFF;
    // backend verifies it with LINE then issues our usual AuthResponse.
    line: (input: { idToken: string; nonce?: string }) =>
      request<AuthResponse>('POST', '/auth/line', { body: input }),
    // Phase 21.2 — Google Sign-In. Frontend passes the id_token from GIS;
    // backend verifies via Google's tokeninfo endpoint, returns same AuthResponse.
    google: (input: { idToken: string; nonce?: string }) =>
      request<AuthResponse>('POST', '/auth/google', { body: input }),
    me: (token: string) => request<User>('GET', '/users/me', { token }),
  },

  shops: {
    create: (token: string, input: CreateShopInput) =>
      request<Shop>('POST', '/shops', { token, body: input }),
    mine: (token: string) => request<Shop[]>('GET', '/shops/mine/list', { token }),
    bySlug: (slug: string) => request<Shop>('GET', `/shops/${slug}`),
  },

  products: {
    list: (limit?: number) => request<Product[]>('GET', '/products', { query: { limit } }),
    getById: (id: string) => request<Product>('GET', `/products/${id}`),
    listByShop: (token: string, shopId: string) =>
      request<Product[]>('GET', `/products/shop/${shopId}/list`, { token }),
    create: (token: string, shopId: string, input: CreateProductInput) =>
      request<Product>('POST', `/products/shop/${shopId}`, { token, body: input }),
  },

  cart: {
    get: (token: string) => request<Cart>('GET', '/cart', { token }),
    add: (token: string, input: AddToCartInput) =>
      request<Cart>('POST', '/cart/items', { token, body: input }),
    update: (token: string, itemId: string, quantity: number) =>
      request<Cart>('PATCH', `/cart/items/${itemId}`, { token, body: { quantity } }),
    clear: (token: string) => request<{ ok: true }>('DELETE', '/cart', { token }),
  },

  checkout: {
    create: (token: string, input: CreateCheckoutInput) =>
      request<Order[]>('POST', '/checkout', { token, body: input }),
  },

  orders: {
    mine: (token: string) => request<Order[]>('GET', '/orders/mine', { token }),
    byShop: (token: string, shopId: string) =>
      request<Order[]>('GET', `/orders/shop/${shopId}`, { token }),
    getOne: (token: string, id: string) => request<Order>('GET', `/orders/${id}`, { token }),
    ship: (token: string, id: string, input: ShipOrderInput) =>
      request<Order>('POST', `/orders/${id}/ship`, { token, body: input }),
    confirmReceived: (token: string, id: string) =>
      request<Order>('POST', `/orders/${id}/confirm-received`, { token }),
    cancel: (token: string, id: string) =>
      request<Order>('POST', `/orders/${id}/cancel`, { token }),
  },

  payments: {
    create: (token: string, input: CreatePaymentInput) =>
      request<Payment>('POST', '/payments', { token, body: input }),
    confirmMock: (token: string, orderId: string) =>
      request<Payment>('POST', `/payments/mock/confirm/${orderId}`, { token }),
    // Phase 20.1 — polling endpoint for the PromptPay sheet.
    byOrder: (token: string, orderId: string) =>
      request<Payment>('GET', `/payments/by-order/${orderId}`, { token }),
  },

  // Phase 2 — Trust & Logistics
  carriers: {
    list: () => request<Carrier[]>('GET', '/carriers'),
  },

  shipping: {
    quote: (input: ShippingQuoteRequest) =>
      request<ShippingQuote>('POST', '/shipping/quote', { body: input }),
  },

  shipments: {
    byOrder: (token: string, orderId: string) =>
      request<Shipment>('GET', `/shipments/${orderId}`, { token }),
    advance: (token: string, orderId: string) =>
      request<Shipment>('POST', `/shipments/${orderId}/advance`, { token }),
  },

  wallet: {
    mine: (token: string) => request<Wallet>('GET', '/wallet', { token }),
    entries: (token: string, limit = 50) =>
      request<WalletEntry[]>('GET', '/wallet/entries', { token, query: { limit } }),
  },

  disputes: {
    mine: (token: string) => request<Dispute[]>('GET', '/disputes/mine', { token }),
    forShop: (token: string, shopId: string) =>
      request<Dispute[]>('GET', `/disputes/shop/${shopId}`, { token }),
    getOne: (token: string, id: string) => request<Dispute>('GET', `/disputes/${id}`, { token }),
    open: (token: string, orderId: string, input: CreateDisputeInput) =>
      request<Dispute>('POST', `/disputes/order/${orderId}`, { token, body: input }),
    reply: (token: string, id: string, input: ReplyDisputeInput) =>
      request<DisputeMessage>('POST', `/disputes/${id}/reply`, { token, body: input }),
    resolve: (token: string, id: string, input: ResolveDisputeInput) =>
      request<Dispute>('POST', `/disputes/${id}/resolve`, { token, body: input }),
  },

  // Phase 3 — Creator / Affiliate
  creators: {
    listPublic: () => request<CreatorProfile[]>('GET', '/creators'),
    me: (token: string) => request<CreatorProfile | null>('GET', '/creators/me', { token }),
    apply: (token: string, input: ApplyCreatorInput) =>
      request<CreatorProfile>('POST', '/creators/apply', { token, body: input }),
    myStats: (token: string) => request<CreatorStats>('GET', '/creators/me/stats', { token }),
    myLinks: (token: string) => request<CreatorLink[]>('GET', '/creators/me/links', { token }),
    createLink: (token: string, input: CreateLinkInput) =>
      request<CreatorLink>('POST', '/creators/me/links', { token, body: input }),
    getMyLink: (token: string, id: string) =>
      request<CreatorLink>('GET', `/creators/me/links/${id}`, { token }),
    myAttributions: (token: string) =>
      request<AffiliateAttribution[]>('GET', '/creators/me/attributions', { token }),
    resolveLink: (code: string) =>
      request<LinkResolve>('GET', `/creators/links/resolve/${code}`),
    trackClick: (code: string) =>
      request<{ ok: true }>('POST', `/creators/links/click/${code}`),
  },

  // Phase 4 — Local Commerce
  local: {
    nearby: (lat: number, lng: number, radiusKm = 10, kind?: string) =>
      request<LocalStore[]>('GET', '/local/stores/nearby', {
        query: { lat, lng, radiusKm, kind },
      }),
    getStore: (shopId: string) =>
      request<LocalStore | null>('GET', `/local/stores/${shopId}`),
    menu: (shopId: string) =>
      request<MenuGroup[]>('GET', `/local/stores/${shopId}/menu`),
    slots: (shopId: string, kind?: 'PICKUP' | 'DELIVERY', from?: string) =>
      request<TimeSlot[]>('GET', `/local/stores/${shopId}/slots`, {
        query: { kind, from },
      }),
    deliveryQuote: (shopId: string, lat: number, lng: number) =>
      request<{ distanceKm: number; costCents: number; inRange: boolean }>(
        'GET',
        `/local/stores/${shopId}/delivery-quote`,
        { query: { lat, lng } },
      ),
    // Merchant
    upsert: (token: string, shopId: string, input: UpsertLocalStoreInput) =>
      request<LocalStore>('PUT', `/local/shops/${shopId}`, { token, body: input }),
    listCategories: (token: string, shopId: string) =>
      request<MenuCategory[]>('GET', `/local/shops/${shopId}/menu/categories`, { token }),
    createCategory: (token: string, shopId: string, input: CreateMenuCategoryInput) =>
      request<MenuCategory>('POST', `/local/shops/${shopId}/menu/categories`, {
        token,
        body: input,
      }),
    deleteCategory: (token: string, shopId: string, categoryId: string) =>
      request<{ ok: true }>(
        'DELETE',
        `/local/shops/${shopId}/menu/categories/${categoryId}`,
        { token },
      ),
    assignItem: (
      token: string,
      shopId: string,
      categoryId: string,
      input: AssignMenuItemInput,
    ) =>
      request<{ ok: true }>(
        'POST',
        `/local/shops/${shopId}/menu/categories/${categoryId}/items`,
        { token, body: input },
      ),
    removeItem: (token: string, shopId: string, categoryId: string, productId: string) =>
      request<{ ok: true }>(
        'DELETE',
        `/local/shops/${shopId}/menu/categories/${categoryId}/items/${productId}`,
        { token },
      ),
    createSlot: (token: string, shopId: string, input: CreateTimeSlotInput) =>
      request<TimeSlot>('POST', `/local/shops/${shopId}/slots`, { token, body: input }),
    deleteSlot: (token: string, shopId: string, slotId: string) =>
      request<{ ok: true }>('DELETE', `/local/shops/${shopId}/slots/${slotId}`, { token }),
  },

  riders: {
    me: (token: string) => request<Rider | null>('GET', '/riders/me', { token }),
    apply: (token: string, input: ApplyRiderInput) =>
      request<Rider>('POST', '/riders/apply', { token, body: input }),
    updateLocation: (token: string, input: RiderLocationInput) =>
      request<Rider>('POST', '/riders/me/location', { token, body: input }),
    openJobs: (token: string) =>
      request<DeliveryJob[]>('GET', '/riders/jobs/open', { token }),
    myJobs: (token: string, status?: string) =>
      request<DeliveryJob[]>('GET', '/riders/jobs/mine', { token, query: { status } }),
    accept: (token: string, id: string) =>
      request<DeliveryJob>('POST', `/riders/jobs/${id}/accept`, { token }),
    pickup: (token: string, id: string) =>
      request<DeliveryJob>('POST', `/riders/jobs/${id}/pickup`, { token }),
    deliver: (token: string, id: string) =>
      request<DeliveryJob>('POST', `/riders/jobs/${id}/deliver`, { token }),
    jobByOrder: (orderId: string) =>
      request<DeliveryJob | null>('GET', `/riders/jobs/by-order/${orderId}`),
  },

  // Phase 5 — Marketing Engine
  coupons: {
    available: (shopId?: string) =>
      request<Coupon[]>('GET', '/coupons/available', { query: { shopId } }),
    quote: (token: string, input: ApplyCouponInput) =>
      request<CouponQuote>('POST', '/coupons/quote', { token, body: input }),
    listForShop: (token: string, shopId: string) =>
      request<Coupon[]>('GET', `/coupons/shops/${shopId}`, { token }),
    create: (token: string, input: CreateCouponInput) =>
      request<Coupon>('POST', '/coupons', { token, body: input }),
    toggle: (token: string, id: string, active: boolean) =>
      request<Coupon>('PATCH', `/coupons/${id}/toggle`, { token, body: { active } }),
  },

  loyalty: {
    me: (token: string) => request<LoyaltyAccount>('GET', '/loyalty/me', { token }),
    entries: (token: string, limit = 50) =>
      request<LoyaltyEntry[]>('GET', '/loyalty/me/entries', { token, query: { limit } }),
    redeem: (token: string, input: RedeemLoyaltyInput) =>
      request<{ discountCents: number; account: LoyaltyAccount }>(
        'POST',
        '/loyalty/redeem',
        { token, body: input },
      ),
  },

  referrals: {
    me: (token: string) => request<Referral>('GET', '/referrals/me', { token }),
    myClaims: (token: string) =>
      request<ReferralClaim[]>('GET', '/referrals/me/claims', { token }),
    claim: (token: string, input: ClaimReferralInput) =>
      request<ReferralClaim>('POST', '/referrals/claim', { token, body: input }),
  },

  campaigns: {
    active: (kind?: CampaignKind) =>
      request<Campaign[]>('GET', '/campaigns/active', { query: { kind } }),
    getById: (id: string) => request<Campaign | null>('GET', `/campaigns/${id}`),
    products: (id: string) =>
      request<CampaignProductView[]>('GET', `/campaigns/${id}/products`),
    listForShop: (token: string, shopId: string) =>
      request<Campaign[]>('GET', `/campaigns/shops/${shopId}`, { token }),
    create: (token: string, input: CreateCampaignInput) =>
      request<Campaign>('POST', '/campaigns', { token, body: input }),
    join: (token: string, id: string, input: JoinCampaignInput) =>
      request<CampaignProduct>('POST', `/campaigns/${id}/products`, {
        token,
        body: input,
      }),
    leave: (token: string, id: string, productId: string) =>
      request<{ ok: true }>('DELETE', `/campaigns/${id}/products/${productId}`, { token }),
    toggle: (token: string, id: string, active: boolean) =>
      request<Campaign>('PATCH', `/campaigns/${id}/toggle`, { token, body: { active } }),
  },

  feed: {
    /**
     * Phase 19.7 — `geo` is optional. When provided, the API tier-1 sorts
     * by distance (≤ 25 km) and tier-2 falls back to popularity score.
     * `lat`/`lng` are sent as plain query params (not in the body) so the
     * Capacitor static export can prefetch through a plain HTTP cache.
     *
     * Phase 20.5 — `tab` switches the surface:
     *   • `'foryou'`    (default) score + optional geo boost
     *   • `'nearby'`    strict geo filter; empty if no geo
     *   • `'community'` pure score order, no geo
     *   • `'following'` / `'friends'` — empty until the follow graph
     *                                   ships (server returns []).
     */
    list: (
      token: string | null,
      cursor = 0,
      limit = 20,
      geo?: { lat: number; lng: number },
      tab?: 'foryou' | 'nearby' | 'community' | 'following' | 'friends',
    ) =>
      request<VideoFeedItem[]>('GET', '/feed', {
        token: token ?? undefined,
        query: {
          cursor,
          limit,
          ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
          ...(tab && tab !== 'foryou' ? { tab } : {}),
        },
      }),
    one: (token: string | null, id: string) =>
      request<VideoFeedItem | null>('GET', `/feed/${id}`, { token: token ?? undefined }),
    view: (id: string) => request<{ ok: true }>('POST', `/feed/${id}/view`),
    create: (token: string, input: CreateVideoInput) =>
      request<VideoPost>('POST', '/feed', { token, body: input }),
    like: (token: string, id: string) =>
      request<{ liked: boolean; likes: number }>('POST', `/feed/${id}/like`, { token }),
    remove: (token: string, id: string) =>
      request<{ ok: true }>('DELETE', `/feed/${id}`, { token }),
    // Phase 12.2 — owner / moderation
    mine: (token: string, limit = 50) =>
      request<VideoFeedItem[]>('GET', '/feed/mine', { token, query: { limit } }),
    report: (token: string, id: string, input: ReportVideoInput) =>
      request<{ ok: true; pendingReports: number }>('POST', `/feed/${id}/report`, {
        token,
        body: input,
      }),
    admin: {
      list: (
        token: string,
        query?: { status?: VideoStatus | 'ALL'; onlyReported?: boolean; limit?: number },
      ) =>
        request<AdminVideoRow[]>('GET', '/feed/admin/all', {
          token,
          query: {
            status: query?.status,
            onlyReported: query?.onlyReported ? 'true' : undefined,
            limit: query?.limit,
          },
        }),
      reports: (
        token: string,
        query?: { status?: 'PENDING' | 'RESOLVED' | 'ALL'; limit?: number },
      ) =>
        request<VideoReportRow[]>('GET', '/feed/admin/reports', {
          token,
          query: { status: query?.status, limit: query?.limit },
        }),
      moderate: (token: string, id: string, input: ModerateVideoInput) =>
        request<{ ok: true; status: VideoStatus }>(
          'PATCH',
          `/feed/admin/${id}/moderate`,
          { token, body: input },
        ),
    },
  },

  broadcasts: {
    listForShop: (token: string, shopId: string) =>
      request<Broadcast[]>('GET', `/broadcasts/shops/${shopId}`, { token }),
    create: (token: string, input: CreateBroadcastInput) =>
      request<Broadcast>('POST', '/broadcasts', { token, body: input }),
    send: (token: string, id: string) =>
      request<Broadcast>('POST', `/broadcasts/${id}/send`, { token }),
    audiencePreview: (token: string, audience: string, shopId?: string | null) =>
      request<{ count: number }>('GET', '/broadcasts/audience/preview', {
        token,
        query: { audience, shopId: shopId ?? undefined },
      }),
    inbox: (token: string, unreadOnly = false) =>
      request<InAppMessage[]>('GET', '/broadcasts/inbox', {
        token,
        query: { unread: unreadOnly ? '1' : undefined },
      }),
    markRead: (token: string, id: string) =>
      request<{ ok: true }>('PATCH', `/broadcasts/inbox/${id}/read`, { token }),
    markAllRead: (token: string) =>
      request<{ ok: true }>('PATCH', '/broadcasts/inbox/read-all', { token }),
  },

  // Phase 6 — AI Engine
  recommendations: {
    forYou: (token: string, limit = 12) =>
      request<ProductRecommendation[]>('GET', '/recommendations/for-you', {
        token,
        query: { limit },
      }),
    similar: (productId: string, limit = 8) =>
      request<ProductRecommendation[]>(
        'GET',
        `/recommendations/similar/${productId}`,
        { query: { limit } },
      ),
    buyAgain: (token: string, limit = 12) =>
      request<BuyAgainItem[]>('GET', '/recommendations/buy-again', {
        token,
        query: { limit },
      }),
    trackView: (productId: string, source?: string) =>
      request<{ ok: true }>('POST', '/recommendations/track-view', {
        body: { productId, source },
      }),
    trending: (limit = 12) =>
      request<ProductRecommendation[]>('GET', '/recommendations/trending', {
        query: { limit },
      }),
  },

  insights: {
    overview: (token: string, shopId: string, days = 30) =>
      request<ShopInsightsOverview>(
        'GET',
        `/insights/shops/${shopId}/overview`,
        { token, query: { days } },
      ),
    trend: (token: string, shopId: string, days = 14) =>
      request<SalesTrendPoint[]>('GET', `/insights/shops/${shopId}/trend`, {
        token,
        query: { days },
      }),
    forecast: (token: string, shopId: string, horizon = 7) =>
      request<DemandForecastPoint[]>(
        'GET',
        `/insights/shops/${shopId}/forecast`,
        { token, query: { horizon } },
      ),
    topProducts: (token: string, shopId: string, limit = 10) =>
      request<TopProduct[]>(
        'GET',
        `/insights/shops/${shopId}/top-products`,
        { token, query: { limit } },
      ),
    anomalies: (token: string, shopId: string) =>
      request<InsightAnomaly[]>('GET', `/insights/shops/${shopId}/anomalies`, {
        token,
      }),
    priceSuggestions: (token: string, shopId: string) =>
      request<PriceSuggestion[]>(
        'GET',
        `/insights/shops/${shopId}/price-suggestions`,
        { token },
      ),
    creatorMatches: (token: string, shopId: string, limit = 5) =>
      request<CreatorMatch[]>(
        'GET',
        `/insights/shops/${shopId}/creator-matches`,
        { token, query: { limit } },
      ),
    segments: (token: string, shopId: string) =>
      request<SegmentSummary[]>('GET', `/insights/shops/${shopId}/segments`, {
        token,
      }),
  },

  risk: {
    shops: (token: string, limit = 50) =>
      request<ShopRisk[]>('GET', '/risk/shops', { token, query: { limit } }),
    shopDetail: (token: string, shopId: string) =>
      request<ShopRisk>('GET', `/risk/shops/${shopId}`, { token }),
    suspiciousOrders: (token: string, limit = 50) =>
      request<OrderRisk[]>('GET', '/risk/orders/suspicious', {
        token,
        query: { limit },
      }),
    logisticsIssues: (token: string) =>
      request<LogisticsIssue[]>('GET', '/risk/logistics', { token }),
  },

  aiOps: {
    summary: (token: string) =>
      request<ModelRunSummary[]>('GET', '/aiops/summary', { token }),
    recent: (token: string, limit = 50) =>
      request<ModelRunRecent[]>('GET', '/aiops/recent', {
        token,
        query: { limit },
      }),
  },

  // Phase 7 — Reviews & Reputation
  reviews: {
    listForProduct: (
      productId: string,
      limit = 20,
      token?: string,
    ) =>
      request<ReviewListItem[]>('GET', `/reviews/product/${productId}`, {
        token,
        query: { limit },
      }),
    productSummary: (productId: string) =>
      request<RatingSummary>('GET', `/reviews/product/${productId}/summary`),
    shopSummary: (shopId: string) =>
      request<RatingSummary>('GET', `/reviews/shop/${shopId}/summary`),
    create: (token: string, input: CreateReviewInput) =>
      request<Review>('POST', '/reviews', { token, body: input }),
    mine: (token: string) =>
      request<Review[]>('GET', '/reviews/mine', { token }),
    pending: (token: string) =>
      request<PendingReviewItem[]>('GET', '/reviews/pending', { token }),
    moderation: (token: string, limit = 50) =>
      request<ModerationReview[]>('GET', '/reviews/moderation', {
        token,
        query: { limit },
      }),
    hide: (token: string, id: string, input: HideReviewInput) =>
      request<Review>('PATCH', `/reviews/${id}/hide`, {
        token,
        body: input,
      }),
    // Phase 9.2
    toggleHelpful: (token: string, id: string) =>
      request<{ helpfulCount: number; helpfulByMe: boolean }>(
        'POST',
        `/reviews/${id}/helpful`,
        { token },
      ),
    hidePhoto: (token: string, photoId: string, input: HidePhotoInput) =>
      request<ReviewPhoto>('PATCH', `/reviews/photos/${photoId}/hide`, {
        token,
        body: input,
      }),
  },

  // Phase 9.2 — Storage (presigned uploads)
  storage: {
    config: (token: string) =>
      request<StorageConfig>('GET', '/storage/config', { token }),
    presign: (token: string, input: PresignUploadInput) =>
      request<PresignUploadResult>('POST', '/storage/presign', {
        token,
        body: input,
      }),
    confirm: (token: string, input: ConfirmUploadInput) =>
      request<{ ok: true; objectKey: string; publicUrl: string }>(
        'POST',
        '/storage/confirm',
        { token, body: input },
      ),
  },

  // Phase 8 — Search & Discovery
  search: {
    products: (input: ProductSearchInput, token?: string) =>
      request<ProductSearchResult>('POST', '/search/products', {
        token,
        body: input,
      }),
    shops: (q: string, limit = 12) =>
      request<ShopSearchHit[]>('GET', '/search/shops', {
        query: { q, limit },
      }),
    suggestions: (q: string, limit = 8) =>
      request<Suggestion[]>('GET', '/search/suggestions', {
        query: { q, limit },
      }),
    track: (input: TrackSearchInput, token?: string) =>
      request<{ ok: true }>('POST', '/search/track', { token, body: input }),
    analyticsTrending: (token: string, limit = 30) =>
      request<TrendingQuery[]>('GET', '/search/analytics/trending', {
        token,
        query: { limit },
      }),
    analyticsZeroResult: (token: string, limit = 30) =>
      request<TrendingQuery[]>('GET', '/search/analytics/zero-result', {
        token,
        query: { limit },
      }),
  },

  // Phase 9.1 — Notifications & Delivery Channels
  notifications: {
    config: () => request<NotificationConfig>('GET', '/notifications/config'),

    push: {
      list: (token: string) =>
        request<PushSubscription[]>('GET', '/notifications/push', { token }),
      subscribe: (token: string, input: SubscribePushInput) =>
        request<PushSubscription>('POST', '/notifications/push/subscribe', {
          token,
          body: input,
        }),
      unsubscribe: (token: string, endpoint: string) =>
        request<{ ok: true }>('DELETE', '/notifications/push/subscribe', {
          token,
          query: { endpoint },
        }),
    },

    devices: {
      list: (token: string) =>
        request<UserDevice[]>('GET', '/notifications/devices', { token }),
      register: (token: string, input: RegisterDeviceInput) =>
        request<UserDevice>('POST', '/notifications/devices', {
          token,
          body: input,
        }),
      unregister: (token: string, tokenToRemove: string) =>
        request<{ ok: true }>(
          'DELETE',
          `/notifications/devices/${encodeURIComponent(tokenToRemove)}`,
          { token },
        ),
    },

    line: {
      me: (token: string) =>
        request<LineLink | null>('GET', '/notifications/line/me', { token }),
      link: (token: string, input: LinkLineInput) =>
        request<LineLink>('POST', '/notifications/line/link', {
          token,
          body: input,
        }),
      unlink: (token: string) =>
        request<{ ok: true }>('DELETE', '/notifications/line/link', { token }),
    },

    prefs: {
      list: (token: string) =>
        request<NotificationPref[]>('GET', '/notifications/prefs', { token }),
      update: (token: string, input: UpdateNotificationPrefInput) =>
        request<NotificationPref>('PATCH', '/notifications/prefs', {
          token,
          body: input,
        }),
    },

    test: (token: string) =>
      request<{
        results: Array<{ channel: string; status: string; error?: string }>;
      }>('POST', '/notifications/test', { token }),
  },

  // Phase 9.3 — CS Chatbot
  chat: {
    config: () => request<ChatbotConfig>('GET', '/chat/config'),

    listMine: (token: string) =>
      request<ChatConversation[]>('GET', '/chat/conversations', { token }),

    active: (token: string) =>
      request<ChatConversation>('GET', '/chat/conversations/active', { token }),

    messages: (token: string, conversationId: string) =>
      request<ChatMessage[]>(
        'GET',
        `/chat/conversations/${conversationId}/messages`,
        { token },
      ),

    send: (token: string, input: SendChatMessageInput) =>
      request<SendChatMessageResult>('POST', '/chat/messages', {
        token,
        body: input,
      }),

    admin: {
      list: (token: string, query?: { handoff?: string; limit?: number }) =>
        request<ChatConversation[]>('GET', '/chat/admin/conversations', {
          token,
          query: query
            ? {
                handoff: query.handoff,
                limit: query.limit,
              }
            : undefined,
        }),
      messages: (token: string, conversationId: string) =>
        request<ChatMessage[]>(
          'GET',
          `/chat/admin/conversations/${conversationId}/messages`,
          { token },
        ),
      reply: (token: string, input: AdminReplyChatInput) =>
        request<ChatMessage>('POST', '/chat/admin/reply', {
          token,
          body: input,
        }),
      takeOver: (token: string, conversationId: string) =>
        request<ChatConversation>(
          'PATCH',
          `/chat/admin/conversations/${conversationId}/take-over`,
          { token },
        ),
    },
  },

  // Phase 10.1 — Privacy & Behavioural Event Firehose
  privacy: {
    get: (token: string) => request<ConsentState>('GET', '/me/privacy', { token }),
    update: (token: string, input: UpdateConsentInput) =>
      request<ConsentState>('PATCH', '/me/privacy', { token, body: input }),
    myEvents: (token: string) =>
      request<UserEvent[]>('GET', '/me/events', { token }),
    deleteMyEvents: (token: string) =>
      request<{ deletedEvents: number }>('DELETE', '/me/events', { token }),
  },

  events: {
    stats: (token: string) =>
      request<EventFirehoseStats>('GET', '/events/stats', { token }),
  },

  // Phase 10.2 — Taste profile / "why am I seeing this?"
  taste: {
    mine: (token: string) =>
      request<TasteProfileSummary | null>('GET', '/me/taste', { token }),
    rebuildMine: (token: string) =>
      request<{ ok: true; eventCount: number; lastUpdatedAt: string }>(
        'POST',
        '/me/taste/rebuild',
        { token },
      ),
    deleteMine: (token: string) =>
      request<{ ok: true }>('DELETE', '/me/taste', { token }),
    admin: (token: string, userId: string) =>
      request<TasteProfileSummary | null>(
        'GET',
        `/admin/users/${userId}/taste`,
        { token },
      ),
    explainFeed: (token: string, limit = 12) =>
      request<{
        recommendations: ProductRecommendation[];
        breakdowns: RecommendationBreakdown[];
      }>('GET', `/recommendations/for-you/explain?limit=${limit}`, { token }),
  },

  // Phase 10.3 — Proactive surfaces
  proactive: {
    rails: (token: string, limit = 10) =>
      request<FeedRail[]>('GET', `/me/feed/rails?limit=${limit}`, { token }),
    bar: (token: string) => request<ProactiveBar>('GET', '/me/feed/bar', { token }),
    myNudges: (token: string, limit = 20) =>
      request<InAppNudge[]>('GET', `/me/nudges?limit=${limit}`, { token }),
    adminSweep: (token: string, kind: string) =>
      request<unknown>('POST', `/admin/proactive/sweep/${kind}`, { token }),
    adminSnapshot: (token: string) =>
      request<{ snapped: number }>('POST', '/admin/proactive/snapshot', { token }),
  },
};

export interface InAppNudge {
  id: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  title: string;
  body: string;
  deepLink: string;
  sentAt: string;
}
